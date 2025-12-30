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
        "transfers_per_event": league_in.transfers_per_event,
        "team_size": league_in.team_size,
        "tier_config": {"tiers": [tier.model_dump() for tier in league_in.tier_config]},
        "captain_multiplier": league_in.captain_multiplier,
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

    # Add selected events to the league
    if league_in.event_ids:
        event_records = [
            {"league_id": league["id"], "event_id": event_id}
            for event_id in league_in.event_ids
        ]
        supabase.table("league_events").insert(event_records).execute()

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
    leagues = response.data or []

    # Get member counts (number of teams) for each league
    counts_response = (
        supabase.table("fantasy_teams")
        .select("league_id")
        .in_("league_id", league_ids)
        .execute()
    )

    counts_data = counts_response.data or []
    league_counts = {}
    for item in counts_data:
        lid = item["league_id"]
        league_counts[lid] = league_counts.get(lid, 0) + 1

    for league in leagues:
        league["member_count"] = league_counts.get(league["id"], 0)

    return leagues


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

    league = response.data

    # Get member count
    count_response = (
        supabase.table("fantasy_teams")
        .select("id", count="exact")
        .eq("league_id", str(league_id))
        .execute()
    )
    league["member_count"] = (
        count_response.count if count_response.count is not None else 0
    )

    return league


@router.get("/{league_id}/events")
def get_league_events(league_id: uuid.UUID, status: str = None):
    """Get all events that are part of a league.

    Args:
        league_id: UUID of the league
        status: Optional filter by event status ('upcoming', 'completed')
    """
    # Get event IDs for this league from junction table
    league_events = (
        supabase.table("league_events")
        .select("event_id")
        .eq("league_id", str(league_id))
        .execute()
    )

    if not league_events.data:
        return []

    event_ids = [le["event_id"] for le in league_events.data]

    # Fetch the full event details
    query = supabase.table("events").select("*").in_("id", event_ids)

    if status:
        query = query.eq("status", status)

    events = query.order("date", desc=True).execute()

    return events.data or []


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


@router.delete("/{league_id}")
def delete_league(
    league_id: uuid.UUID,
    authorization: str = Header(None),
):
    """Delete a league. Only the league creator (admin) can delete."""
    user_id = get_current_user_id(authorization)

    # Get league and verify ownership
    league_response = (
        supabase.table("leagues")
        .select("id, name, admin_id")
        .eq("id", str(league_id))
        .single()
        .execute()
    )

    if not league_response.data:
        raise HTTPException(status_code=404, detail="League not found")

    league = league_response.data

    if league["admin_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Only the league creator can delete the league"
        )

    # Delete in order (foreign key constraints):
    # 1. Delete team_transfers for teams in this league
    teams = (
        supabase.table("fantasy_teams")
        .select("id")
        .eq("league_id", str(league_id))
        .execute()
    )
    team_ids = [t["id"] for t in (teams.data or [])]

    if team_ids:
        for team_id in team_ids:
            supabase.table("team_transfers").delete().eq("team_id", team_id).execute()
            supabase.table("captain_history").delete().eq("team_id", team_id).execute()
            supabase.table("team_roster").delete().eq("team_id", team_id).execute()

    # 2. Delete fantasy_teams
    supabase.table("fantasy_teams").delete().eq("league_id", str(league_id)).execute()

    # 3. Delete league_events
    supabase.table("league_events").delete().eq("league_id", str(league_id)).execute()

    # 4. Delete league_members
    supabase.table("league_members").delete().eq("league_id", str(league_id)).execute()

    # 5. Delete league
    supabase.table("leagues").delete().eq("id", str(league_id)).execute()

    return {"message": f"League '{league['name']}' deleted successfully"}
