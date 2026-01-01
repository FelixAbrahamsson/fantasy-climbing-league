import logging
import time
from typing import List

from app.db.supabase import supabase
from app.schemas.team import ClimberResponse
from app.services.ifsc_sdk import IFSCClient
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=List[ClimberResponse])
def get_climbers(gender: str = None, active: bool = True):
    """Get all climbers, optionally filtered by gender."""
    max_retries = 2

    for attempt in range(max_retries + 1):
        try:
            query = supabase.table("climbers").select("*")

            if gender:
                query = query.eq("gender", gender)

            if active:
                query = query.eq("active", True)

            response = query.execute()
            return response.data or []
        except Exception as e:
            if attempt < max_retries:
                logger.warning(
                    f"Climbers fetch failed (attempt {attempt + 1}), retrying: {e}"
                )
                time.sleep(0.2)
                continue
            logger.error(f"Climbers fetch failed after {max_retries + 1} attempts: {e}")
            raise HTTPException(
                status_code=503, detail="Database temporarily unavailable"
            )


@router.get("/registration-status/{event_id}")
async def get_registration_status(
    event_id: int,
    climber_ids: str = Query(..., description="Comma-separated list of climber IDs"),
):
    """
    Check if athletes are registered for a specific event.

    Args:
        event_id: IFSC event ID
        climber_ids: Comma-separated climber IDs to check

    Returns:
        Dictionary mapping climber_id -> is_registered
    """
    try:
        # Parse climber IDs
        ids = [int(cid.strip()) for cid in climber_ids.split(",") if cid.strip()]

        if not ids:
            return {"registrations": {}}

        # IFSC uses truncated event IDs for the registrations endpoint
        # e.g., 14080 (men) and 14081 (women) both use 1408
        truncated_event_id = event_id // 10

        # Fetch registrations from IFSC API
        client = IFSCClient()
        registrations = await client.get_event_registrations(truncated_event_id)

        # Build set of registered athlete IDs
        registered_ids = {reg.athlete_id for reg in registrations}

        # Return status for each requested climber
        result = {cid: cid in registered_ids for cid in ids}

        return {"event_id": event_id, "registrations": result}

    except Exception as e:
        logger.error(f"Error fetching registration status for event {event_id}: {e}")
        raise HTTPException(
            status_code=503, detail=f"Could not fetch registration status: {str(e)}"
        )


@router.get("/{climber_id}", response_model=ClimberResponse)
def get_climber(climber_id: int):
    """Get a specific climber by ID."""
    try:
        response = (
            supabase.table("climbers")
            .select("*")
            .eq("id", climber_id)
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Climber not found")

        return response.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching climber {climber_id}: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")
