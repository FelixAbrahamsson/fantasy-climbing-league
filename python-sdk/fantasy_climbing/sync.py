"""
Data sync services for Fantasy Climbing League.

Fetches climber and event data from the IFSC API and populates the database.
"""

import logging
from typing import Optional

from ifsc_sdk import IFSCClient, IFSCClientError
from ifsc_sdk.client import (
    is_world_cup_league,
    parse_discipline,
    parse_event_date,
    parse_gender,
)

from .db import (
    clear_event_registrations,
    get_supabase_client,
    mark_event_completed,
    upsert_climber,
    upsert_event,
    upsert_ranking,
    upsert_registration,
    upsert_result,
)
from .scoring import get_points_for_rank

logger = logging.getLogger(__name__)

# CUWR ID mapping for discipline + gender combinations
CUWR_IDS = {
    ("lead", "men"): 1,
    ("boulder", "men"): 3,
    ("lead", "women"): 5,
    ("boulder", "women"): 7,
    ("speed", "men"): 2,
    ("speed", "women"): 6,
}


def _get_internal_event_id(ifsc_event_id: int, gender: str) -> int:
    """
    Generate an internal event ID for our database.

    Since we store men's and women's categories as separate events,
    we use: ifsc_event_id * 10 + (0 for men, 1 for women)
    """
    return ifsc_event_id * 10 + (0 if gender == "men" else 1)


async def sync_events(
    year: int = 2025,
    world_cups_only: bool = True,
    disciplines: Optional[list[str]] = None,
) -> dict:
    """
    Fetch and populate all events for a season from IFSC.

    Args:
        year: Season year (2024, 2025, or 2026)
        world_cups_only: If True, only sync World Cup/Championship events
        disciplines: List of disciplines to sync ('boulder', 'lead', 'speed'). None = all

    Returns:
        Dictionary with counts of synced data
    """
    if disciplines is None:
        disciplines = ["boulder", "lead", "speed"]

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
                    event_data = {
                        "id": _get_internal_event_id(full_event.event_id, gender),
                        "name": f"{full_event.event} - {dcat.dcat_name}",
                        "date": parse_event_date(full_event.starts_at).isoformat(),
                        "discipline": discipline,
                        "gender": gender,
                        "status": (
                            "completed" if dcat.status == "finished" else "upcoming"
                        ),
                    }
                    upsert_event(event_data)
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


async def sync_results(event_id: int, dcat_id: int) -> dict:
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
        internal_event_id = _get_internal_event_id(event_id, gender)

        for athlete in event_results.ranking:
            if athlete.rank is None:
                continue

            # Upsert climber
            climber_data = {
                "id": athlete.athlete_id,
                "name": f"{athlete.firstname} {athlete.lastname}".strip(),
                "country": athlete.country,
                "gender": gender,
                "active": True,
            }
            upsert_climber(climber_data)
            results["climbers"] += 1

            # Upsert result
            result_data = {
                "event_id": internal_event_id,
                "climber_id": athlete.athlete_id,
                "rank": athlete.rank,
                "score": get_points_for_rank(athlete.rank),
            }
            upsert_result(result_data)
            results["results"] += 1

        # Mark event as completed if results are final
        if event_results.status == "finished":
            mark_event_completed(internal_event_id)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def sync_event_results(ifsc_event_id: int) -> dict:
    """
    Fetch and populate results for a specific event by IFSC event ID.

    This is the replacement for the old backend endpoint:
    POST /api/v1/events/{event_id}/add-results

    Args:
        ifsc_event_id: IFSC event ID (e.g., 1410 for event 14100 internal ID)

    Returns:
        Dictionary with counts of synced data
    """
    client = IFSCClient()
    results = {"categories": 0, "climbers": 0, "results": 0, "errors": []}

    try:
        # Fetch event details
        full_event = await client.get_event(ifsc_event_id)
        logger.info(f"Fetching results for: {full_event.event}")

        for dcat in full_event.d_cats:
            if dcat.status != "finished":
                logger.info(f"  Skipping {dcat.dcat_name} - status: {dcat.status}")
                continue

            discipline = parse_discipline(dcat.discipline_kind)
            if discipline is None:
                continue

            logger.info(f"  Syncing {dcat.dcat_name}...")
            cat_results = await sync_results(ifsc_event_id, dcat.dcat_id)
            results["categories"] += 1
            results["climbers"] += cat_results["climbers"]
            results["results"] += cat_results["results"]
            results["errors"].extend(cat_results["errors"])

        logger.info(
            f"Synced {results['results']} results from {results['categories']} categories"
        )

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def sync_all_results(year: int = 2025) -> dict:
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
                    cat_results = await sync_results(event_info.event_id, dcat.dcat_id)
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


async def sync_athletes(
    year: int = 2025,
    world_cups_only: bool = True,
) -> dict:
    """
    Fetch and populate all athletes from event registrations for a season.

    Args:
        year: Season year (2024, 2025, or 2026)
        world_cups_only: If True, only sync from World Cup/Championship events

    Returns:
        Dictionary with counts of synced data
    """
    client = IFSCClient()
    results = {"events": 0, "climbers": 0, "men": 0, "women": 0, "errors": []}

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

                # Fetch registrations for this event
                registrations = await client.get_event_registrations(
                    event_info.event_id
                )
                logger.info(
                    f"Fetched {len(registrations)} registrations for {event_info.event}"
                )

                for reg in registrations:
                    # Convert gender: 0 = men, 1 = women
                    gender = "men" if reg.gender == 0 else "women"

                    climber_data = {
                        "id": reg.athlete_id,
                        "name": f"{reg.firstname} {reg.lastname}".strip(),
                        "country": reg.country,
                        "gender": gender,
                        "active": True,
                    }

                    upsert_climber(climber_data)
                    results["climbers"] += 1
                    if gender == "men":
                        results["men"] += 1
                    else:
                        results["women"] += 1

                results["events"] += 1

            except Exception as e:
                error_msg = f"Error syncing event {event_info.event_id}: {e}"
                logger.error(error_msg)
                results["errors"].append(error_msg)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def sync_registrations(
    year: int = 2025,
    world_cups_only: bool = True,
    disciplines: Optional[list[str]] = None,
) -> dict:
    """
    Sync event registrations from IFSC for all events in a season.

    This stores which athletes are registered for each event so the frontend
    can check registration status without calling the IFSC API directly.

    Args:
        year: Season year (2024, 2025, or 2026)
        world_cups_only: If True, only sync World Cup/Championship events
        disciplines: List of disciplines to sync. None = all

    Returns:
        Dictionary with counts of synced data
    """
    if disciplines is None:
        disciplines = ["boulder", "lead", "speed"]

    client = IFSCClient()
    results = {"events": 0, "registrations": 0, "errors": []}

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

                # Get event details to determine internal IDs
                full_event = await client.get_event(event_info.event_id)

                # Process each category (men/women for each discipline)
                for dcat in full_event.d_cats:
                    discipline = parse_discipline(dcat.discipline_kind)
                    gender = parse_gender(dcat.category_name)

                    if discipline not in disciplines:
                        continue
                    if gender is None:
                        continue

                    internal_event_id = _get_internal_event_id(
                        full_event.event_id, gender
                    )

                    # Clear existing registrations for this event
                    clear_event_registrations(internal_event_id)

                # Fetch registrations for this IFSC event
                registrations = await client.get_event_registrations(
                    event_info.event_id
                )
                logger.info(
                    f"Fetched {len(registrations)} registrations for {event_info.event}"
                )

                for reg in registrations:
                    # Determine which internal event ID to use based on gender
                    gender = "men" if reg.gender == 0 else "women"
                    internal_event_id = _get_internal_event_id(
                        event_info.event_id, gender
                    )

                    upsert_registration(internal_event_id, reg.athlete_id)
                    results["registrations"] += 1

                results["events"] += 1

            except Exception as e:
                error_msg = (
                    f"Error syncing registrations for {event_info.event_id}: {e}"
                )
                logger.error(error_msg)
                results["errors"].append(error_msg)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def sync_rankings(
    year: int,
    discipline: str,
    gender: str,
) -> dict:
    """
    Sync IFSC world rankings for a specific discipline/gender/season.

    Args:
        year: Season year
        discipline: 'boulder', 'lead', or 'speed'
        gender: 'men' or 'women'

    Returns:
        Dictionary with counts of synced data
    """
    client = IFSCClient()
    results = {"synced_count": 0, "errors": []}

    cuwr_id = CUWR_IDS.get((discipline, gender))
    if cuwr_id is None:
        results["errors"].append(
            f"Invalid discipline/gender combination: {discipline}/{gender}"
        )
        return results

    try:
        rankings = await client.get_cuwr_rankings(cuwr_id, year)
        logger.info(
            f"Fetched {len(rankings)} ranking entries for {discipline} {gender} {year}"
        )

        for entry in rankings:
            # First upsert the climber
            climber_data = {
                "id": entry["athlete_id"],
                "name": f"{entry.get('firstname', '')} {entry.get('lastname', '')}".strip()
                or entry.get("name", ""),
                "country": entry.get("country", ""),
                "gender": gender,
                "active": True,
            }
            upsert_climber(climber_data)

            # Then upsert the ranking
            ranking_data = {
                "season": year,
                "discipline": discipline,
                "gender": gender,
                "climber_id": entry["athlete_id"],
                "rank": entry["rank"],
                "score": entry.get("score"),
            }
            upsert_ranking(ranking_data)
            results["synced_count"] += 1

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def sync_all_rankings(year: int) -> dict:
    """
    Sync rankings for all discipline/gender combinations.

    Args:
        year: Season year

    Returns:
        Dictionary with counts of synced data
    """
    combinations = [
        ("boulder", "men"),
        ("boulder", "women"),
        ("lead", "men"),
        ("lead", "women"),
        ("speed", "men"),
        ("speed", "women"),
    ]

    total_results = {"synced_count": 0, "errors": []}

    for discipline, gender in combinations:
        logger.info(f"Syncing {discipline} {gender} rankings for {year}...")
        result = await sync_rankings(year, discipline, gender)
        total_results["synced_count"] += result["synced_count"]
        total_results["errors"].extend(result["errors"])

    return total_results


async def sync_all(
    year: int = 2025,
    world_cups_only: bool = True,
    include_rankings: bool = True,
) -> dict:
    """
    Sync all IFSC data for a season.

    Args:
        year: Season year
        world_cups_only: If True, only sync World Cup/Championship events
        include_rankings: If True, also sync world rankings

    Returns:
        Dictionary with counts of synced data
    """
    logger.info(f"Starting full sync for {year}...")

    results = {
        "events": {},
        "athletes": {},
        "results": {},
        "rankings": {},
    }

    # Sync events
    logger.info("Syncing events...")
    results["events"] = await sync_events(year, world_cups_only)

    # Sync athletes from registrations
    logger.info("Syncing athletes from registrations...")
    results["athletes"] = await sync_athletes(year, world_cups_only)

    # Sync results for completed events
    logger.info("Syncing results for completed events...")
    results["results"] = await sync_all_results(year)

    # Sync rankings
    if include_rankings:
        logger.info("Syncing world rankings...")
        results["rankings"] = await sync_all_rankings(year)

    logger.info("Full sync complete!")
    return results
