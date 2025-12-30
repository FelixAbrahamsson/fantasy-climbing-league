"""
Test Data Service

Provides functionality to set up test data for development/testing.
Uses real IFSC data with shifted dates to simulate a season in progress.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.supabase import supabase
from app.services.ifsc_sdk import (
    IFSCClient,
    IFSCClientError,
    is_world_cup_league,
    parse_discipline,
    parse_gender,
)
from app.services.scoring import get_points_for_rank

logger = logging.getLogger(__name__)


async def setup_test_season(
    year: int = 2025,
    num_past_events: int = 1,
    days_between_events: int = 7,
) -> dict:
    """
    Set up a test season using real IFSC data with shifted dates.

    This fetches events from the specified year and shifts their dates so that:
    - First `num_past_events` events are in the past (with results)
    - Remaining events are spaced out into the future (no results)

    Args:
        year: IFSC season year to pull data from
        num_past_events: Number of events to place in the past (default: 1)
        days_between_events: Days between each event (default: 7)

    Returns:
        Dictionary with counts of synced data
    """
    client = IFSCClient()
    results = {
        "events": 0,
        "climbers": 0,
        "results": 0,
        "past_events": 0,
        "future_events": 0,
        "errors": [],
    }

    # Calculate base date: first event was yesterday
    now = datetime.now(timezone.utc)
    first_event_date = now - timedelta(days=1)

    try:
        season = await client.get_season(year)
        logger.info(f"Fetched season {season.name} with {len(season.events)} events")

        # Collect all World Cup events that have completed
        wc_events = []
        for event_info in season.events:
            if is_world_cup_league(event_info.league_season_id, season.leagues):
                wc_events.append(event_info)

        logger.info(f"Found {len(wc_events)} World Cup events")

        # Sort events by their original date
        wc_events.sort(key=lambda e: e.local_start_date or "")

        # Process each event with shifted dates
        event_index = 0
        for event_info in wc_events:
            try:
                full_event = await client.get_event(event_info.event_id)

                # Calculate new date for this event
                if event_index < num_past_events:
                    # Past event: yesterday minus index days
                    new_date = first_event_date - timedelta(days=event_index)
                    is_past = True
                else:
                    # Future event: today plus spacing
                    days_ahead = (
                        event_index - num_past_events + 1
                    ) * days_between_events
                    new_date = now + timedelta(days=days_ahead)
                    is_past = False

                # Process each category (men/women for boulder/lead)
                for dcat in full_event.d_cats:
                    discipline = parse_discipline(dcat.discipline_kind)
                    gender = parse_gender(dcat.category_name)

                    if discipline is None or gender is None:
                        continue

                    # Generate internal event ID
                    internal_event_id = full_event.event_id * 10 + (
                        0 if gender == "men" else 1
                    )

                    # Create event with shifted date
                    event_data = {
                        "id": internal_event_id,
                        "name": f"{full_event.event} - {dcat.dcat_name}",
                        "date": new_date.isoformat(),
                        "discipline": discipline,
                        "gender": gender,
                        "status": "completed" if is_past else "upcoming",
                    }
                    supabase.table("events").upsert(event_data).execute()
                    results["events"] += 1

                    if is_past:
                        results["past_events"] += 1
                    else:
                        results["future_events"] += 1

                    # If past event and finished, sync results
                    if is_past and dcat.status == "finished":
                        try:
                            event_results = await client.get_event_results(
                                full_event.event_id, dcat.dcat_id
                            )

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
                                supabase.table("climbers").upsert(
                                    climber_data
                                ).execute()
                                results["climbers"] += 1

                                # Upsert result
                                result_data = {
                                    "event_id": internal_event_id,
                                    "climber_id": athlete.athlete_id,
                                    "rank": athlete.rank,
                                    "score": get_points_for_rank(athlete.rank),
                                }
                                supabase.table("event_results").upsert(
                                    result_data, on_conflict="event_id,climber_id"
                                ).execute()
                                results["results"] += 1

                                # Upsert ranking (mock season ranking using event rank)
                                ranking_data = {
                                    "climber_id": athlete.athlete_id,
                                    "discipline": discipline,
                                    "gender": gender,
                                    "season": datetime.now().year,  # Current year (2025)
                                    "rank": athlete.rank,
                                    "score": get_points_for_rank(athlete.rank),
                                }
                                supabase.table("athlete_rankings").upsert(
                                    ranking_data,
                                    on_conflict="climber_id,discipline,gender,season",
                                ).execute()

                        except Exception as e:
                            logger.warning(
                                f"Could not fetch results for {dcat.dcat_name}: {e}"
                            )

                    # For future events, sync athletes from registrations
                    elif not is_past:
                        try:
                            registrations = await client.get_event_registrations(
                                full_event.event_id
                            )
                            for reg in registrations:
                                reg_gender = "men" if reg.gender == 0 else "women"
                                if reg_gender != gender:
                                    continue

                                climber_data = {
                                    "id": reg.athlete_id,
                                    "name": f"{reg.firstname} {reg.lastname}".strip(),
                                    "country": reg.country,
                                    "gender": reg_gender,
                                    "active": True,
                                }
                                supabase.table("climbers").upsert(
                                    climber_data
                                ).execute()
                                results["climbers"] += 1
                        except Exception as e:
                            logger.warning(f"Could not fetch registrations: {e}")

                event_index += 1
                logger.info(
                    f"Synced event: {event_info.event} (date: {new_date.date()})"
                )

            except Exception as e:
                error_msg = f"Error syncing event {event_info.event_id}: {e}"
                logger.error(error_msg)
                results["errors"].append(error_msg)

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))

    return results


async def add_results_to_event(event_id: int) -> dict:
    """
    Add real IFSC results to a specific event.

    This fetches actual results from IFSC and adds them to the event,
    also marking the event as completed.

    Args:
        event_id: Internal event ID (ifsc_id * 10 + gender_offset)

    Returns:
        Dictionary with counts of synced data
    """
    results = {"climbers": 0, "results": 0, "errors": []}

    # Parse IFSC event ID and gender from internal ID
    ifsc_event_id = event_id // 10
    gender = "men" if event_id % 10 == 0 else "women"

    client = IFSCClient()

    try:
        # Get the event to find the dcat_id
        full_event = await client.get_event(ifsc_event_id)

        target_dcat = None
        for dcat in full_event.d_cats:
            dcat_gender = parse_gender(dcat.category_name)
            discipline = parse_discipline(dcat.discipline_kind)
            if dcat_gender == gender and discipline is not None:
                target_dcat = dcat
                break

        if target_dcat is None:
            results["errors"].append(f"Could not find category for event {event_id}")
            return results

        # Fetch results
        event_results = await client.get_event_results(
            ifsc_event_id, target_dcat.dcat_id
        )

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
            supabase.table("climbers").upsert(climber_data).execute()
            results["climbers"] += 1

            # Upsert result
            result_data = {
                "event_id": event_id,
                "climber_id": athlete.athlete_id,
                "rank": athlete.rank,
                "score": get_points_for_rank(athlete.rank),
            }
            supabase.table("event_results").upsert(
                result_data, on_conflict="event_id,climber_id"
            ).execute()
            results["results"] += 1

            # Upsert ranking (mock season ranking using event rank)
            # Need discipline and gender from target_dcat (which we have)
            ranking_data = {
                "climber_id": athlete.athlete_id,
                "discipline": parse_discipline(target_dcat.discipline_kind),
                "gender": gender,
                "season": datetime.now().year,  # Current year
                "rank": athlete.rank,
                "score": get_points_for_rank(athlete.rank),
            }
            supabase.table("athlete_rankings").upsert(
                ranking_data,
                on_conflict="climber_id,discipline,gender,season",
            ).execute()

        # Mark event as completed
        supabase.table("events").update({"status": "completed"}).eq(
            "id", event_id
        ).execute()

        logger.info(f"Added {results['results']} results to event {event_id}")

    except IFSCClientError as e:
        logger.error(f"IFSC API error: {e}")
        results["errors"].append(str(e))
    except Exception as e:
        logger.error(f"Error adding results: {e}")
        results["errors"].append(str(e))

    return results


def clear_all_data() -> dict:
    """
    Clear all test data from the database.

    WARNING: This deletes ALL data - use with caution!

    Returns:
        Dictionary with counts of deleted records
    """
    results = {}

    # UUID Tables (use UUID for deletion check)
    uuid_tables = [
        "event_results",
        "team_roster",
        "team_transfers",  # Fixed: was "transfers"
        "fantasy_teams",
        "league_events",
        "league_members",
        "leagues",
        "athlete_rankings",
    ]

    # Integer ID Tables (use integer for deletion check)
    int_tables = [
        "climbers",
        "events",
    ]

    # Clear UUID tables first (foreign keys usually point TO int tables)
    for table in uuid_tables:
        try:
            response = (
                supabase.table(table)
                .delete()
                .neq("id", "00000000-0000-0000-0000-000000000000")
                .execute()
            )
            if response.data:
                results[table] = len(response.data)
            logger.info(f"Cleared {results.get(table, 0)} records from {table}")
        except Exception as e:
            logger.warning(f"Could not clear {table}: {e}")
            results[f"{table}_error"] = str(e)

    # Clear Integer tables
    for table in int_tables:
        try:
            # Delete valid IDs (positive integers)
            response = supabase.table(table).delete().gte("id", 0).execute()
            if response.data:
                results[table] = len(response.data)
            logger.info(f"Cleared {results.get(table, 0)} records from {table}")
        except Exception as e:
            logger.warning(f"Could not clear {table}: {e}")
            results[f"{table}_error"] = str(e)

    return results
