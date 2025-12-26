import uuid
from typing import List

from app.core.auth import get_current_user_id
from app.db.supabase import supabase
from app.schemas.team import (
    ClimberResponse,
    TeamCreate,
    TeamResponse,
    TeamRosterUpdate,
    TeamWithRoster,
)
from fastapi import APIRouter, Header, HTTPException

router = APIRouter()


@router.post("/", response_model=TeamResponse)
def create_team(
    team_in: TeamCreate,
    authorization: str = Header(None),
):
    """Create a new fantasy team in a league."""
    user_id = get_current_user_id(authorization)

    # Check if user is a member of the league
    member_check = (
        supabase.table("league_members")
        .select("id")
        .eq("league_id", str(team_in.league_id))
        .eq("user_id", user_id)
        .execute()
    )

    if not member_check.data:
        raise HTTPException(
            status_code=403, detail="You are not a member of this league"
        )

    # Check if user already has a team in this league
    existing_team = (
        supabase.table("fantasy_teams")
        .select("id")
        .eq("league_id", str(team_in.league_id))
        .eq("user_id", user_id)
        .execute()
    )

    if existing_team.data:
        raise HTTPException(
            status_code=400, detail="You already have a team in this league"
        )

    team_data = {
        "name": team_in.name,
        "league_id": str(team_in.league_id),
        "user_id": user_id,
    }

    response = supabase.table("fantasy_teams").insert(team_data).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create team")

    return response.data[0]


@router.get("/league/{league_id}", response_model=List[TeamResponse])
def get_teams_in_league(league_id: uuid.UUID):
    """Get all teams in a league."""
    response = (
        supabase.table("fantasy_teams")
        .select("*")
        .eq("league_id", str(league_id))
        .execute()
    )

    return response.data or []


@router.get("/{team_id}", response_model=TeamWithRoster)
def get_team_with_roster(team_id: uuid.UUID):
    """Get a team with its current roster."""
    # Get team
    team_response = (
        supabase.table("fantasy_teams")
        .select("*")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data

    # Get roster (only active members - removed_at is null)
    roster_response = (
        supabase.table("team_roster")
        .select("climber_id, is_captain, climbers(*)")
        .eq("team_id", str(team_id))
        .is_("removed_at", "null")
        .execute()
    )

    roster = []
    captain_id = None

    for entry in roster_response.data or []:
        climber_data = entry.get("climbers")
        if climber_data:
            roster.append(ClimberResponse(**climber_data))
            if entry.get("is_captain"):
                captain_id = climber_data["id"]

    return TeamWithRoster(
        **team,
        roster=roster,
        captain_id=captain_id,
    )


@router.put("/{team_id}/roster", response_model=TeamWithRoster)
def update_team_roster(
    team_id: uuid.UUID,
    roster_update: TeamRosterUpdate,
    authorization: str = Header(None),
):
    """Update the team's roster. Max 6 climbers, one captain."""
    user_id = get_current_user_id(authorization)

    # Verify team belongs to user
    team_response = (
        supabase.table("fantasy_teams")
        .select("*")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data

    if team["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You don't own this team")

    # Validate roster: max 6, exactly one captain
    if len(roster_update.roster) > 6:
        raise HTTPException(status_code=400, detail="Maximum 6 climbers allowed")

    captains = [r for r in roster_update.roster if r.is_captain]
    if len(captains) != 1:
        raise HTTPException(status_code=400, detail="Exactly one captain required")

    # Mark all current roster entries as removed
    from datetime import datetime, timezone

    supabase.table("team_roster").update(
        {"removed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("team_id", str(team_id)).is_("removed_at", "null").execute()

    # Insert new roster entries
    for entry in roster_update.roster:
        supabase.table("team_roster").insert(
            {
                "team_id": str(team_id),
                "climber_id": entry.climber_id,
                "is_captain": entry.is_captain,
            }
        ).execute()

    # Return updated team
    return get_team_with_roster(team_id)


@router.put("/{team_id}/captain/{climber_id}")
def set_captain(
    team_id: uuid.UUID,
    climber_id: int,
    authorization: str = Header(None),
):
    """Set a climber as team captain."""
    user_id = get_current_user_id(authorization)

    # Verify team ownership
    team_response = (
        supabase.table("fantasy_teams")
        .select("user_id")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data or team_response.data["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Remove captain status from current captain
    supabase.table("team_roster").update({"is_captain": False}).eq(
        "team_id", str(team_id)
    ).eq("is_captain", True).is_("removed_at", "null").execute()

    # Set new captain
    result = (
        supabase.table("team_roster")
        .update({"is_captain": True})
        .eq("team_id", str(team_id))
        .eq("climber_id", climber_id)
        .is_("removed_at", "null")
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Climber not found in roster")

    return {"message": "Captain updated successfully"}
