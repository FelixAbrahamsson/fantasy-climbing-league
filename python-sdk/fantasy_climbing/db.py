"""
Database module for Fantasy Climbing SDK.

Provides Supabase client configuration and helper functions.
"""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from supabase import Client, create_client

# Load .env file from python-sdk directory
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Get a configured Supabase client.

    Uses environment variables:
        SUPABASE_URL: Your Supabase project URL
        SUPABASE_KEY: Your Supabase service role key

    Returns:
        Configured Supabase client

    Raises:
        ValueError: If environment variables are not set
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_KEY environment variables must be set. "
            "Create a .env file in the python-sdk directory or set them in your environment."
        )

    return create_client(url, key)


def upsert_event(event_data: dict) -> None:
    """Upsert an event record to the database."""
    client = get_supabase_client()
    client.table("events").upsert(event_data, on_conflict="id").execute()


def upsert_climber(climber_data: dict) -> None:
    """Upsert a climber record to the database."""
    client = get_supabase_client()
    client.table("climbers").upsert(climber_data, on_conflict="id").execute()


def upsert_result(result_data: dict) -> None:
    """Upsert an event result record to the database."""
    client = get_supabase_client()
    client.table("event_results").upsert(
        result_data, on_conflict="event_id,climber_id"
    ).execute()


def upsert_ranking(ranking_data: dict) -> None:
    """Upsert a ranking record to the database."""
    client = get_supabase_client()
    client.table("athlete_rankings").upsert(
        ranking_data, on_conflict="season,discipline,gender,climber_id"
    ).execute()


def mark_event_completed(event_id: int) -> None:
    """Mark an event as completed."""
    client = get_supabase_client()
    client.table("events").update({"status": "completed"}).eq("id", event_id).execute()


def get_events_by_season(
    year: int, discipline: str | None = None, gender: str | None = None
) -> list[dict]:
    """Get events for a season, optionally filtered."""
    client = get_supabase_client()

    # Events are stored with IDs derived from IFSC IDs
    # We need to filter by year based on date
    query = client.table("events").select("*")

    if discipline:
        query = query.eq("discipline", discipline)
    if gender:
        query = query.eq("gender", gender)

    # Filter by year - events have date field
    query = query.gte("date", f"{year}-01-01").lt("date", f"{year + 1}-01-01")

    response = query.execute()
    return response.data or []


def upsert_registration(event_id: int, climber_id: int) -> None:
    """Upsert an event registration record to the database."""
    client = get_supabase_client()
    client.table("event_registrations").upsert(
        {"event_id": event_id, "climber_id": climber_id},
        on_conflict="event_id,climber_id",
    ).execute()


def clear_event_registrations(event_id: int) -> None:
    """Clear all registrations for an event before re-syncing."""
    client = get_supabase_client()
    client.table("event_registrations").delete().eq("event_id", event_id).execute()


def get_event_registrations(event_id: int) -> list[int]:
    """Get list of registered climber IDs for an event."""
    client = get_supabase_client()
    response = (
        client.table("event_registrations")
        .select("climber_id")
        .eq("event_id", event_id)
        .execute()
    )
    return [r["climber_id"] for r in (response.data or [])]
