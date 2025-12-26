from typing import List, Optional

from app.db.supabase import supabase
from app.schemas.event import EventResponse
from app.services.ifsc_data import (
    populate_all_completed_results,
    populate_event_results,
    populate_season_data,
    seed_mock_data,
)
from fastapi import APIRouter, Header, HTTPException, Query

router = APIRouter()


@router.get("/", response_model=List[EventResponse])
def get_events(
    discipline: str = None,
    gender: str = None,
    status: str = None,
):
    """Get all events, optionally filtered."""
    query = supabase.table("events").select("*")

    if discipline:
        query = query.eq("discipline", discipline)
    if gender:
        query = query.eq("gender", gender)
    if status:
        query = query.eq("status", status)

    response = query.order("date", desc=True).execute()
    return response.data or []


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int):
    """Get a specific event by ID."""
    response = (
        supabase.table("events").select("*").eq("id", event_id).single().execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Event not found")

    return response.data


@router.post("/seed-mock-data")
def seed_data(authorization: str = Header(None)):
    """
    Seed the database with mock data.
    In production, this should be admin-only.
    """
    # TODO: Add admin check
    result = seed_mock_data()
    return {"message": "Mock data seeded successfully", "counts": result}


@router.post("/sync-ifsc-season")
async def sync_ifsc_season(
    year: int = Query(default=2025, ge=2024, le=2026),
    world_cups_only: bool = Query(default=True),
    disciplines: Optional[List[str]] = Query(default=None),
    authorization: str = Header(None),
):
    """
    Sync all events from IFSC for a given season.

    This fetches event metadata and creates event records in the database.
    Results are not fetched - use sync-ifsc-event-results for that.

    Args:
        year: Season year (2024, 2025, or 2026)
        world_cups_only: If True, only sync World Cup/Championship events
        disciplines: List of disciplines to sync ('boulder', 'lead'). Defaults to both.
    """
    # TODO: Add admin check
    result = await populate_season_data(
        year=year,
        world_cups_only=world_cups_only,
        disciplines=disciplines,
    )

    if result["errors"]:
        return {
            "message": f"Season {year} synced with some errors",
            "counts": result,
            "errors": result["errors"],
        }

    return {
        "message": f"Season {year} synced successfully",
        "counts": {
            "events": result["events"],
            "categories": result["categories"],
        },
    }


@router.post("/sync-ifsc-event-results/{event_id}/{dcat_id}")
async def sync_ifsc_event_results(
    event_id: int,
    dcat_id: int,
    authorization: str = Header(None),
):
    """
    Sync results for a specific IFSC event category.

    This fetches full rankings and creates climber and result records.

    Args:
        event_id: IFSC event ID
        dcat_id: IFSC discipline category ID (e.g., 227 for boulder men)
    """
    # TODO: Add admin check
    result = await populate_event_results(event_id=event_id, dcat_id=dcat_id)

    if result["errors"]:
        return {
            "message": "Results synced with some errors",
            "counts": result,
            "errors": result["errors"],
        }

    return {
        "message": "Results synced successfully",
        "counts": {
            "climbers": result["climbers"],
            "results": result["results"],
        },
    }


@router.post("/sync-ifsc-all-results")
async def sync_ifsc_all_results(
    year: int = Query(default=2025, ge=2024, le=2026),
    authorization: str = Header(None),
):
    """
    Sync results for all completed events in a season.

    This fetches full rankings for all finished event categories.

    Args:
        year: Season year (2024, 2025, or 2026)
    """
    # TODO: Add admin check
    result = await populate_all_completed_results(year=year)

    if result["errors"]:
        return {
            "message": f"Results for {year} synced with some errors",
            "counts": result,
            "errors": result["errors"][:10],  # Limit errors in response
        }

    return {
        "message": f"Results for {year} synced successfully",
        "counts": {
            "events": result["events"],
            "climbers": result["climbers"],
            "results": result["results"],
        },
    }
