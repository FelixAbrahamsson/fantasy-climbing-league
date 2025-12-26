"""
IFSC Data Service

Fetches climber and event data from the IFSC API and populates the database.
Falls back to mock data if API is unavailable.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from app.db.supabase import supabase
from app.services.ifsc_sdk import (
    IFSCClient,
    IFSCClientError,
    IFSCFullEvent,
    IFSCLeague,
    IFSCResultsResponse,
    IFSCSeasonResponse,
    is_world_cup_league,
    parse_discipline,
    parse_event_date,
    parse_gender,
)
from app.services.scoring import get_points_for_rank

logger = logging.getLogger(__name__)


# ============================================================================
# Database Population Functions
# ============================================================================


async def populate_season_data(
    year: int = 2025,
    world_cups_only: bool = True,
    disciplines: Optional[list[str]] = None,
) -> dict:
    """
    Fetch and populate all events for a season from IFSC.

    Args:
        year: Season year (2024, 2025, or 2026)
        world_cups_only: If True, only sync World Cup/Championship events
        disciplines: List of disciplines to sync ('boulder', 'lead'). None = all supported

    Returns:
        Dictionary with counts of synced data
    """
    if disciplines is None:
        disciplines = ["boulder", "lead"]

    client = IFSCClient()
    results = {"events": 0, "categories": 0, "errors": []}

    try:
        season = await client.get_season(year)
        logger.info(f"Fetched season {season.name} with {len(season.events)} events")

        for event_info in season.events:
            try:
                # Filter by league if requested
                if world_cups_only and not is_world_cup_league(
                    event_info.league_season_id, season.leagues
                ):
                    continue

                # Check if event has any disciplines we care about
                event_disciplines = [d.kind.lower() for d in event_info.disciplines]
                if not any(d in disciplines for d in event_disciplines):
                    continue

                # Fetch full event details
                full_event = await client.get_event(event_info.event_id)

                # Process each category (men/women for each discipline)
                for dcat in full_event.d_cats:
                    discipline = parse_discipline(dcat.discipline_kind)
                    gender = parse_gender(dcat.category_name)

                    if discipline not in disciplines:
                        continue
                    if gender is None:
                        continue

                    # Create event record for this category
                    event_data = _build_event_record(
                        full_event, dcat, discipline, gender
                    )
                    _upsert_event(event_data)
                    results["categories"] += 1

                results["events"] += 1
                logger.info(f"Synced event: {event_info.event} ({event_info.event_id})")

            except Exception as e:
                error_msg = f"Error syncing event {event_info.event_id}: {e}"
                logger.error(error_msg)
                results["errors"].append(error_msg)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def populate_event_results(event_id: int, dcat_id: int) -> dict:
    """
    Fetch and populate results for a specific event category.

    Args:
        event_id: IFSC event ID
        dcat_id: IFSC discipline category ID

    Returns:
        Dictionary with counts of synced data
    """
    client = IFSCClient()
    results = {"climbers": 0, "results": 0, "errors": []}

    try:
        event_results = await client.get_event_results(event_id, dcat_id)
        logger.info(
            f"Fetched results for {event_results.event} - {event_results.dcat}: "
            f"{len(event_results.ranking)} athletes"
        )

        # Determine gender from dcat name
        gender = "men" if "Men" in event_results.dcat else "women"

        # Generate our internal event ID (since we store men/women separately)
        internal_event_id = _get_internal_event_id(event_id, gender)

        for athlete in event_results.ranking:
            if athlete.rank is None:
                continue

            # Upsert climber
            climber_data = _build_climber_record(athlete, gender)
            _upsert_climber(climber_data)
            results["climbers"] += 1

            # Upsert result
            result_data = _build_result_record(internal_event_id, athlete)
            _upsert_result(result_data)
            results["results"] += 1

        # Mark event as completed if results are final
        if event_results.status == "finished":
            _mark_event_completed(internal_event_id)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def populate_all_completed_results(year: int = 2025) -> dict:
    """
    Fetch and populate results for all completed events in a season.

    Args:
        year: Season year

    Returns:
        Dictionary with counts of synced data
    """
    client = IFSCClient()
    results = {"events": 0, "climbers": 0, "results": 0, "errors": []}

    try:
        season = await client.get_season(year)

        for event_info in season.events:
            try:
                full_event = await client.get_event(event_info.event_id)

                for dcat in full_event.d_cats:
                    if dcat.status != "finished":
                        continue

                    discipline = parse_discipline(dcat.discipline_kind)
                    if discipline is None:
                        continue

                    # Populate results for this category
                    cat_results = await populate_event_results(
                        event_info.event_id, dcat.dcat_id
                    )
                    results["climbers"] += cat_results["climbers"]
                    results["results"] += cat_results["results"]
                    results["errors"].extend(cat_results["errors"])

                results["events"] += 1

            except Exception as e:
                error_msg = f"Error processing event {event_info.event_id}: {e}"
                logger.error(error_msg)
                results["errors"].append(error_msg)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


# ============================================================================
# Helper Functions
# ============================================================================


def _get_internal_event_id(ifsc_event_id: int, gender: str) -> int:
    """
    Generate an internal event ID for our database.

    Since we store men's and women's categories as separate events,
    we use: ifsc_event_id * 10 + (0 for men, 1 for women)
    """
    return ifsc_event_id * 10 + (0 if gender == "men" else 1)


def _build_event_record(
    event: IFSCFullEvent, dcat, discipline: str, gender: str
) -> dict:
    """Build an event record for database insertion."""
    return {
        "id": _get_internal_event_id(event.event_id, gender),
        "name": f"{event.event} - {dcat.dcat_name}",
        "date": parse_event_date(event.starts_at).isoformat(),
        "discipline": discipline,
        "gender": gender,
        "status": "completed" if dcat.status == "finished" else "upcoming",
    }


def _build_climber_record(athlete, gender: str) -> dict:
    """Build a climber record for database insertion."""
    return {
        "id": athlete.athlete_id,
        "name": f"{athlete.firstname} {athlete.lastname}".strip(),
        "country": athlete.country,
        "gender": gender,
        "active": True,
    }


def _build_result_record(event_id: int, athlete) -> dict:
    """Build an event result record for database insertion."""
    return {
        "event_id": event_id,
        "climber_id": athlete.athlete_id,
        "rank": athlete.rank,
        "score": get_points_for_rank(athlete.rank),
    }


def _upsert_event(event_data: dict) -> None:
    """Upsert an event record to the database."""
    supabase.table("events").upsert(event_data).execute()


def _upsert_climber(climber_data: dict) -> None:
    """Upsert a climber record to the database."""
    supabase.table("climbers").upsert(climber_data).execute()


def _upsert_result(result_data: dict) -> None:
    """Upsert an event result record to the database."""
    supabase.table("event_results").upsert(
        result_data, on_conflict="event_id,climber_id"
    ).execute()


def _mark_event_completed(event_id: int) -> None:
    """Mark an event as completed."""
    supabase.table("events").update({"status": "completed"}).eq(
        "id", event_id
    ).execute()


# ============================================================================
# Mock Data (for development/testing)
# ============================================================================

MOCK_CLIMBERS = [
    # Men - Boulder
    {
        "id": 1,
        "name": "Toby Roberts",
        "country": "GBR",
        "gender": "men",
        "active": True,
    },
    {
        "id": 2,
        "name": "Sorato Anraku",
        "country": "JPN",
        "gender": "men",
        "active": True,
    },
    {
        "id": 3,
        "name": "Mejdi Schalck",
        "country": "FRA",
        "gender": "men",
        "active": True,
    },
    {"id": 4, "name": "Adam Ondra", "country": "CZE", "gender": "men", "active": True},
    {
        "id": 5,
        "name": "Tomoa Narasaki",
        "country": "JPN",
        "gender": "men",
        "active": True,
    },
    {"id": 6, "name": "Colin Duffy", "country": "USA", "gender": "men", "active": True},
    {
        "id": 7,
        "name": "Yoshiyuki Ogata",
        "country": "JPN",
        "gender": "men",
        "active": True,
    },
    {
        "id": 8,
        "name": "Alberto Ginés López",
        "country": "ESP",
        "gender": "men",
        "active": True,
    },
    {"id": 9, "name": "Paul Jenft", "country": "FRA", "gender": "men", "active": True},
    {"id": 10, "name": "Dohyun Lee", "country": "KOR", "gender": "men", "active": True},
    # Women - Boulder
    {
        "id": 11,
        "name": "Janja Garnbret",
        "country": "SLO",
        "gender": "women",
        "active": True,
    },
    {
        "id": 12,
        "name": "Oriane Bertone",
        "country": "FRA",
        "gender": "women",
        "active": True,
    },
    {
        "id": 13,
        "name": "Miho Nonaka",
        "country": "JPN",
        "gender": "women",
        "active": True,
    },
    {"id": 14, "name": "Ai Mori", "country": "JPN", "gender": "women", "active": True},
    {
        "id": 15,
        "name": "Brooke Raboutou",
        "country": "USA",
        "gender": "women",
        "active": True,
    },
    {
        "id": 16,
        "name": "Natalia Grossman",
        "country": "USA",
        "gender": "women",
        "active": True,
    },
    {
        "id": 17,
        "name": "Erin McNeice",
        "country": "GBR",
        "gender": "women",
        "active": True,
    },
    {
        "id": 18,
        "name": "Camilla Moroni",
        "country": "ITA",
        "gender": "women",
        "active": True,
    },
    {
        "id": 19,
        "name": "Stasa Gejo",
        "country": "SRB",
        "gender": "women",
        "active": True,
    },
    {
        "id": 20,
        "name": "Futaba Ito",
        "country": "JPN",
        "gender": "women",
        "active": True,
    },
]

MOCK_EVENTS = [
    {
        "id": 1,
        "name": "IFSC World Cup Hachioji 2024 - Boulder Men",
        "date": "2024-04-20T00:00:00Z",
        "discipline": "boulder",
        "gender": "men",
        "status": "completed",
    },
    {
        "id": 2,
        "name": "IFSC World Cup Hachioji 2024 - Boulder Women",
        "date": "2024-04-20T00:00:00Z",
        "discipline": "boulder",
        "gender": "women",
        "status": "completed",
    },
    {
        "id": 3,
        "name": "IFSC World Cup Keqiao 2024 - Boulder Men",
        "date": "2024-05-04T00:00:00Z",
        "discipline": "boulder",
        "gender": "men",
        "status": "completed",
    },
    {
        "id": 4,
        "name": "IFSC World Cup Keqiao 2024 - Boulder Women",
        "date": "2024-05-04T00:00:00Z",
        "discipline": "boulder",
        "gender": "women",
        "status": "completed",
    },
    {
        "id": 5,
        "name": "IFSC World Cup Salt Lake City 2024 - Boulder Men",
        "date": "2024-05-18T00:00:00Z",
        "discipline": "boulder",
        "gender": "men",
        "status": "upcoming",
    },
    {
        "id": 6,
        "name": "IFSC World Cup Salt Lake City 2024 - Boulder Women",
        "date": "2024-05-18T00:00:00Z",
        "discipline": "boulder",
        "gender": "women",
        "status": "upcoming",
    },
]

MOCK_RESULTS = [
    # Event 1: Hachioji Men Boulder
    {"event_id": 1, "climber_id": 2, "rank": 1},  # Sorato Anraku
    {"event_id": 1, "climber_id": 1, "rank": 2},  # Toby Roberts
    {"event_id": 1, "climber_id": 3, "rank": 3},  # Mejdi Schalck
    {"event_id": 1, "climber_id": 5, "rank": 4},  # Tomoa Narasaki
    {"event_id": 1, "climber_id": 7, "rank": 5},  # Yoshiyuki Ogata
    {"event_id": 1, "climber_id": 6, "rank": 6},  # Colin Duffy
    {"event_id": 1, "climber_id": 4, "rank": 7},  # Adam Ondra
    {"event_id": 1, "climber_id": 8, "rank": 8},  # Alberto Ginés López
    # Event 2: Hachioji Women Boulder
    {"event_id": 2, "climber_id": 11, "rank": 1},  # Janja Garnbret
    {"event_id": 2, "climber_id": 12, "rank": 2},  # Oriane Bertone
    {"event_id": 2, "climber_id": 13, "rank": 3},  # Miho Nonaka
    {"event_id": 2, "climber_id": 14, "rank": 4},  # Ai Mori
    {"event_id": 2, "climber_id": 15, "rank": 5},  # Brooke Raboutou
    {"event_id": 2, "climber_id": 16, "rank": 6},  # Natalia Grossman
    {"event_id": 2, "climber_id": 17, "rank": 7},  # Erin McNeice
    {"event_id": 2, "climber_id": 18, "rank": 8},  # Camilla Moroni
    # Event 3: Keqiao Men Boulder
    {"event_id": 3, "climber_id": 1, "rank": 1},  # Toby Roberts
    {"event_id": 3, "climber_id": 2, "rank": 2},  # Sorato Anraku
    {"event_id": 3, "climber_id": 5, "rank": 3},  # Tomoa Narasaki
    {"event_id": 3, "climber_id": 3, "rank": 4},  # Mejdi Schalck
    {"event_id": 3, "climber_id": 6, "rank": 5},  # Colin Duffy
    {"event_id": 3, "climber_id": 7, "rank": 6},  # Yoshiyuki Ogata
    {"event_id": 3, "climber_id": 9, "rank": 7},  # Paul Jenft
    {"event_id": 3, "climber_id": 4, "rank": 8},  # Adam Ondra
    # Event 4: Keqiao Women Boulder
    {"event_id": 4, "climber_id": 11, "rank": 1},  # Janja Garnbret
    {"event_id": 4, "climber_id": 14, "rank": 2},  # Ai Mori
    {"event_id": 4, "climber_id": 12, "rank": 3},  # Oriane Bertone
    {"event_id": 4, "climber_id": 16, "rank": 4},  # Natalia Grossman
    {"event_id": 4, "climber_id": 13, "rank": 5},  # Miho Nonaka
    {"event_id": 4, "climber_id": 15, "rank": 6},  # Brooke Raboutou
    {"event_id": 4, "climber_id": 20, "rank": 7},  # Futaba Ito
    {"event_id": 4, "climber_id": 19, "rank": 8},  # Stasa Gejo
]


def seed_mock_data() -> dict:
    """Seed the database with mock data for development."""
    results = {"climbers": 0, "events": 0, "results": 0}

    # Seed climbers
    for climber in MOCK_CLIMBERS:
        supabase.table("climbers").upsert(climber).execute()
        results["climbers"] += 1

    # Seed events
    for event in MOCK_EVENTS:
        supabase.table("events").upsert(event).execute()
        results["events"] += 1

    # Seed results
    for result in MOCK_RESULTS:
        result_with_score = {
            **result,
            "score": get_points_for_rank(result["rank"]),
        }
        supabase.table("event_results").upsert(
            result_with_score, on_conflict="event_id,climber_id"
        ).execute()
        results["results"] += 1

    return results


# ============================================================================
# Legacy Functions (kept for backwards compatibility)
# ============================================================================


async def fetch_ifsc_events(season: int = 2024) -> list[dict]:
    """
    Fetch events from IFSC API.

    Deprecated: Use IFSCClient.get_season() instead.
    """
    try:
        client = IFSCClient()
        season_data = await client.get_season(season)
        return [event.model_dump() for event in season_data.events]
    except Exception as e:
        logger.error(f"Error fetching IFSC events: {e}")
        return []


async def fetch_ifsc_event_results(event_id: int, category_id: int) -> list[dict]:
    """
    Fetch results for a specific event category.

    Deprecated: Use IFSCClient.get_event_results() instead.
    """
    try:
        client = IFSCClient()
        results = await client.get_event_results(event_id, category_id)
        return [athlete.model_dump() for athlete in results.ranking]
    except Exception as e:
        logger.error(f"Error fetching IFSC results: {e}")
        return []


def sync_climbers_from_results(results: list[dict], gender: str) -> None:
    """Sync climbers from result data to database."""
    for result in results:
        climber_data = {
            "id": result.get("athlete_id"),
            "name": f"{result.get('firstname', '')} {result.get('lastname', '')}".strip(),
            "country": result.get("country", ""),
            "gender": gender,
            "active": True,
        }

        # Upsert climber
        supabase.table("climbers").upsert(climber_data).execute()


def sync_results_to_database(event_id: int, results: list[dict]) -> None:
    """Sync event results to database."""
    for result in results:
        rank = result.get("rank")
        if rank is None:
            continue

        result_data = {
            "event_id": event_id,
            "climber_id": result.get("athlete_id"),
            "rank": rank,
            "score": get_points_for_rank(rank),
        }

        # Upsert result
        supabase.table("event_results").upsert(
            result_data, on_conflict="event_id,climber_id"
        ).execute()
