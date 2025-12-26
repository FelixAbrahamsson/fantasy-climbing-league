import secrets
import uuid
from typing import List

from app.core.auth import get_current_user_id
from app.db.supabase import supabase
from app.schemas.league import LeagueCreate, LeagueJoin, LeagueResponse
from fastapi import APIRouter, Depends, Header, HTTPException

router = APIRouter()


@router.post("/", response_model=LeagueResponse)
def create_league(
    league_in: LeagueCreate,
    authorization: str = Header(None),
):
    """Create a new league."""
    user_id = get_current_user_id(authorization)
    invite_code = secrets.token_urlsafe(6)

    league_data = {
        "name": league_in.name,
        "gender": league_in.gender,
        "discipline": league_in.discipline,
        "admin_id": user_id,
        "invite_code": invite_code,
    }

    response = supabase.table("leagues").insert(league_data).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create league")

    league = response.data[0]

    # Also add the creator as a member with admin role
    supabase.table("league_members").insert(
        {
            "league_id": league["id"],
            "user_id": user_id,
            "role": "admin",
        }
    ).execute()

    return league


@router.get("/", response_model=List[LeagueResponse])
def get_leagues(authorization: str = Header(None)):
    """Get all leagues the user is a member of."""
    user_id = get_current_user_id(authorization)

    # Get leagues where user is a member
    member_response = (
        supabase.table("league_members")
        .select("league_id")
        .eq("user_id", user_id)
        .execute()
    )

    if not member_response.data:
        return []

    league_ids = [m["league_id"] for m in member_response.data]

    response = supabase.table("leagues").select("*").in_("id", league_ids).execute()

    return response.data or []


@router.get("/{league_id}", response_model=LeagueResponse)
def get_league(league_id: uuid.UUID):
    """Get a specific league by ID."""
    response = (
        supabase.table("leagues")
        .select("*")
        .eq("id", str(league_id))
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="League not found")

    return response.data


@router.post("/join", response_model=LeagueResponse)
def join_league(
    join_data: LeagueJoin,
    authorization: str = Header(None),
):
    """Join a league using an invite code."""
    user_id = get_current_user_id(authorization)

    # Find league by invite code
    response = (
        supabase.table("leagues")
        .select("*")
        .eq("invite_code", join_data.invite_code)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    league = response.data

    # Check if already a member
    existing = (
        supabase.table("league_members")
        .select("id")
        .eq("league_id", league["id"])
        .eq("user_id", user_id)
        .execute()
    )

    if existing.data:
        raise HTTPException(status_code=400, detail="Already a member of this league")

    # Add as member
    supabase.table("league_members").insert(
        {
            "league_id": league["id"],
            "user_id": user_id,
            "role": "member",
        }
    ).execute()

    return league
