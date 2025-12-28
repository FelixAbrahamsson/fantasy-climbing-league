import logging
import time
from typing import List

from app.db.supabase import supabase
from app.schemas.team import ClimberResponse
from fastapi import APIRouter, HTTPException

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
