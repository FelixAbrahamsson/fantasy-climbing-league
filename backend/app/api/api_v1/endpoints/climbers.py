from typing import List

from app.db.supabase import supabase
from app.schemas.team import ClimberResponse
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/", response_model=List[ClimberResponse])
def get_climbers(gender: str = None, active: bool = True):
    """Get all climbers, optionally filtered by gender."""
    query = supabase.table("climbers").select("*")

    if gender:
        query = query.eq("gender", gender)

    if active:
        query = query.eq("active", True)

    response = query.execute()
    return response.data or []


@router.get("/{climber_id}", response_model=ClimberResponse)
def get_climber(climber_id: int):
    """Get a specific climber by ID."""
    response = (
        supabase.table("climbers").select("*").eq("id", climber_id).single().execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Climber not found")

    return response.data
