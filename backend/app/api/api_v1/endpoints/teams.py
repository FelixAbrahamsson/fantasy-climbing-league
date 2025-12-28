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
    from datetime import datetime, timezone

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

    now = datetime.now(timezone.utc).isoformat()

    # Mark the old captain's history record as replaced
    supabase.table("captain_history").update({"replaced_at": now}).eq(
        "team_id", str(team_id)
    ).is_("replaced_at", "null").execute()

    # Insert new captain history record
    supabase.table("captain_history").insert(
        {
            "team_id": str(team_id),
            "climber_id": climber_id,
            "set_at": now,
        }
    ).execute()

    # Remove captain status from current captain in roster
    supabase.table("team_roster").update({"is_captain": False}).eq(
        "team_id", str(team_id)
    ).eq("is_captain", True).is_("removed_at", "null").execute()

    # Set new captain in roster
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


@router.get("/{team_id}/event-breakdown")
def get_team_event_breakdown(team_id: uuid.UUID):
    """Get breakdown of team scores per event with athlete details."""
    from app.services.scoring import calculate_climber_score

    # Get team with league info
    team_response = (
        supabase.table("fantasy_teams")
        .select("*, leagues(discipline, gender)")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data
    league = team.get("leagues") or {}

    # Get roster with climber details
    roster_response = (
        supabase.table("team_roster")
        .select("climber_id, is_captain, climbers(id, name, country)")
        .eq("team_id", str(team_id))
        .is_("removed_at", "null")
        .execute()
    )

    roster = roster_response.data or []
    climber_ids = [r["climber_id"] for r in roster]
    climber_map = {}
    captain_id = None
    for r in roster:
        climber_data = r.get("climbers") or {}
        climber_map[r["climber_id"]] = {
            "id": climber_data.get("id"),
            "name": climber_data.get("name", "Unknown"),
            "country": climber_data.get("country"),
            "is_captain": r.get("is_captain", False),
        }
        if r.get("is_captain"):
            captain_id = r["climber_id"]

    # Get league events or fall back to matching discipline/gender events
    league_id = team["league_id"]
    league_events_response = (
        supabase.table("league_events")
        .select("event_id")
        .eq("league_id", league_id)
        .execute()
    )

    if league_events_response.data:
        event_ids = [le["event_id"] for le in league_events_response.data]
        events_response = (
            supabase.table("events")
            .select("*")
            .in_("id", event_ids)
            .order("date", desc=False)
            .execute()
        )
    else:
        events_response = (
            supabase.table("events")
            .select("*")
            .eq("discipline", league.get("discipline"))
            .eq("gender", league.get("gender"))
            .order("date", desc=False)
            .execute()
        )

    events = events_response.data or []

    # Get all event results for team climbers
    event_breakdown = []

    for event in events:
        event_id = event["id"]

        # Get results for all team climbers in this event
        results_response = (
            (
                supabase.table("event_results")
                .select("climber_id, rank, score")
                .eq("event_id", event_id)
                .in_("climber_id", climber_ids)
                .execute()
            )
            if climber_ids
            else {"data": []}
        )

        athlete_scores = []
        event_total = 0

        results_map = {
            r["climber_id"]: r
            for r in (
                results_response.data
                if hasattr(results_response, "data")
                else results_response.get("data", [])
            )
        }

        for climber_id, climber_info in climber_map.items():
            result = results_map.get(climber_id)
            if result:
                is_captain = climber_info["is_captain"]
                points = calculate_climber_score(result["rank"], is_captain)
                athlete_scores.append(
                    {
                        "climber_id": climber_id,
                        "climber_name": climber_info["name"],
                        "country": climber_info["country"],
                        "is_captain": is_captain,
                        "rank": result["rank"],
                        "base_points": result["score"],
                        "total_points": points,
                    }
                )
                event_total += points
            else:
                athlete_scores.append(
                    {
                        "climber_id": climber_id,
                        "climber_name": climber_info["name"],
                        "country": climber_info["country"],
                        "is_captain": climber_info["is_captain"],
                        "rank": None,
                        "base_points": 0,
                        "total_points": 0,
                    }
                )

        # Sort by points descending
        athlete_scores.sort(key=lambda x: x["total_points"], reverse=True)

        event_breakdown.append(
            {
                "event_id": event_id,
                "event_name": event["name"],
                "event_date": event["date"],
                "event_status": event["status"],
                "team_total": event_total,
                "athlete_scores": athlete_scores,
            }
        )

    return {
        "team_id": str(team_id),
        "team_name": team["name"],
        "league_id": league_id,
        "events": event_breakdown,
    }


@router.get("/league/{league_id}/event-breakdown")
def get_league_event_breakdown(league_id: uuid.UUID):
    """Get breakdown of all teams' scores per event for a league."""
    from app.services.scoring import calculate_climber_score

    # Get league info
    league_response = (
        supabase.table("leagues")
        .select("discipline, gender")
        .eq("id", str(league_id))
        .single()
        .execute()
    )

    if not league_response.data:
        raise HTTPException(status_code=404, detail="League not found")

    league = league_response.data

    # Get all teams in the league with their rosters
    teams_response = (
        supabase.table("fantasy_teams")
        .select("id, name, user_id, profiles(username)")
        .eq("league_id", str(league_id))
        .execute()
    )

    teams = teams_response.data or []

    # Get rosters for all teams
    team_rosters = {}
    for team in teams:
        roster_response = (
            supabase.table("team_roster")
            .select("climber_id, is_captain, climbers(id, name, country)")
            .eq("team_id", team["id"])
            .is_("removed_at", "null")
            .execute()
        )
        team_rosters[team["id"]] = roster_response.data or []

    # Get league events or fall back to matching discipline/gender events
    league_events_response = (
        supabase.table("league_events")
        .select("event_id")
        .eq("league_id", str(league_id))
        .execute()
    )

    if league_events_response.data:
        event_ids = [le["event_id"] for le in league_events_response.data]
        events_response = (
            supabase.table("events")
            .select("*")
            .in_("id", event_ids)
            .order("date", desc=False)
            .execute()
        )
    else:
        events_response = (
            supabase.table("events")
            .select("*")
            .eq("discipline", league.get("discipline"))
            .eq("gender", league.get("gender"))
            .order("date", desc=False)
            .execute()
        )

    events = events_response.data or []

    # Build breakdown per event
    event_breakdown = []

    for event in events:
        event_id = event["id"]

        # Get all event results for this event
        all_results_response = (
            supabase.table("event_results")
            .select("climber_id, rank, score")
            .eq("event_id", event_id)
            .execute()
        )
        results_map = {r["climber_id"]: r for r in (all_results_response.data or [])}

        # Calculate scores for each team
        teams_data = []
        for team in teams:
            roster = team_rosters.get(team["id"], [])
            athlete_scores = []
            team_total = 0

            for r in roster:
                climber_data = r.get("climbers") or {}
                climber_id = r["climber_id"]
                is_captain = r.get("is_captain", False)
                result = results_map.get(climber_id)

                if result:
                    points = calculate_climber_score(result["rank"], is_captain)
                    team_total += points
                    athlete_scores.append(
                        {
                            "climber_id": climber_id,
                            "climber_name": climber_data.get("name", "Unknown"),
                            "country": climber_data.get("country"),
                            "is_captain": is_captain,
                            "rank": result["rank"],
                            "points": points,
                        }
                    )
                else:
                    athlete_scores.append(
                        {
                            "climber_id": climber_id,
                            "climber_name": climber_data.get("name", "Unknown"),
                            "country": climber_data.get("country"),
                            "is_captain": is_captain,
                            "rank": None,
                            "points": 0,
                        }
                    )

            # Sort athletes by points descending
            athlete_scores.sort(key=lambda x: x["points"], reverse=True)

            profile = team.get("profiles") or {}
            teams_data.append(
                {
                    "team_id": team["id"],
                    "team_name": team["name"],
                    "username": profile.get("username"),
                    "team_total": team_total,
                    "athletes": athlete_scores,
                }
            )

        # Sort teams by total for this event
        teams_data.sort(key=lambda x: x["team_total"], reverse=True)

        event_breakdown.append(
            {
                "event_id": event_id,
                "event_name": event["name"],
                "event_date": event["date"],
                "event_status": event["status"],
                "teams": teams_data,
            }
        )

    return {
        "league_id": str(league_id),
        "events": event_breakdown,
    }


# =============================================================================
# Transfer Endpoints
# =============================================================================

from datetime import datetime, timezone

from app.schemas.transfer import TransferCreate, TransferResponse


@router.post("/{team_id}/transfer", response_model=TransferResponse)
def create_transfer(
    team_id: uuid.UUID,
    transfer_in: TransferCreate,
    authorization: str = Header(None),
):
    """Make a transfer (swap one climber for another) after an event."""
    user_id = get_current_user_id(authorization)

    # Verify team ownership
    team_response = (
        supabase.table("fantasy_teams")
        .select("*, leagues(transfers_per_event, discipline, gender)")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data
    if team["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You don't own this team")

    league = team.get("leagues") or {}
    transfers_allowed = league.get("transfers_per_event", 1)

    if transfers_allowed == 0:
        raise HTTPException(
            status_code=400, detail="Transfers are disabled for this league"
        )

    # Verify the event exists and is completed
    event_response = (
        supabase.table("events")
        .select("*")
        .eq("id", transfer_in.after_event_id)
        .single()
        .execute()
    )

    if not event_response.data:
        raise HTTPException(status_code=404, detail="Event not found")

    event = event_response.data
    if event["status"] != "completed":
        raise HTTPException(status_code=400, detail="Event is not completed yet")

    # Check if next event has started (transfer window closed)
    next_event = (
        supabase.table("events")
        .select("*")
        .eq("discipline", league.get("discipline"))
        .eq("gender", league.get("gender"))
        .gt("date", event["date"])
        .order("date", desc=False)
        .limit(1)
        .execute()
    )

    if next_event.data and len(next_event.data) > 0:
        next_event_data = next_event.data[0]
        if next_event_data["status"] in ["completed", "in_progress"]:
            raise HTTPException(
                status_code=400,
                detail="Transfer window has closed (next event has started)",
            )

    # Count existing active transfers for this event
    existing_transfers = (
        supabase.table("team_transfers")
        .select("id")
        .eq("team_id", str(team_id))
        .eq("after_event_id", transfer_in.after_event_id)
        .is_("reverted_at", "null")
        .execute()
    )

    if len(existing_transfers.data or []) >= transfers_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {transfers_allowed} transfer(s) allowed per event",
        )

    # Verify climber_out is in current roster
    roster_check = (
        supabase.table("team_roster")
        .select("id, is_captain")
        .eq("team_id", str(team_id))
        .eq("climber_id", transfer_in.climber_out_id)
        .is_("removed_at", "null")
        .execute()
    )

    if not roster_check.data:
        raise HTTPException(
            status_code=400, detail="Climber to remove is not in your roster"
        )

    is_swapping_captain = roster_check.data[0].get("is_captain", False)

    if is_swapping_captain and not transfer_in.new_captain_id:
        raise HTTPException(
            status_code=400,
            detail="You are swapping out your captain. Please provide new_captain_id",
        )

    # Verify climber_in is not already in roster
    in_roster_check = (
        supabase.table("team_roster")
        .select("id")
        .eq("team_id", str(team_id))
        .eq("climber_id", transfer_in.climber_in_id)
        .is_("removed_at", "null")
        .execute()
    )

    if in_roster_check.data:
        raise HTTPException(
            status_code=400, detail="New climber is already in your roster"
        )

    # Perform the transfer
    now = datetime.now(timezone.utc).isoformat()

    # Remove the old climber from roster
    supabase.table("team_roster").update({"removed_at": now}).eq(
        "team_id", str(team_id)
    ).eq("climber_id", transfer_in.climber_out_id).is_("removed_at", "null").execute()

    # Add the new climber to roster
    new_is_captain = (
        is_swapping_captain and transfer_in.new_captain_id == transfer_in.climber_in_id
    )
    supabase.table("team_roster").insert(
        {
            "team_id": str(team_id),
            "climber_id": transfer_in.climber_in_id,
            "is_captain": new_is_captain,
            "added_at": now,
        }
    ).execute()

    # If swapping captain and new captain is existing roster member, update their captain status
    if is_swapping_captain and transfer_in.new_captain_id != transfer_in.climber_in_id:
        supabase.table("team_roster").update({"is_captain": True}).eq(
            "team_id", str(team_id)
        ).eq("climber_id", transfer_in.new_captain_id).is_(
            "removed_at", "null"
        ).execute()

    # Record the transfer
    transfer_data = {
        "team_id": str(team_id),
        "after_event_id": transfer_in.after_event_id,
        "climber_out_id": transfer_in.climber_out_id,
        "climber_in_id": transfer_in.climber_in_id,
    }

    transfer_response = supabase.table("team_transfers").insert(transfer_data).execute()

    if not transfer_response.data:
        raise HTTPException(status_code=500, detail="Failed to record transfer")

    return transfer_response.data[0]


@router.delete("/{team_id}/transfer/{after_event_id}")
def revert_transfer(
    team_id: uuid.UUID,
    after_event_id: int,
    authorization: str = Header(None),
):
    """Revert a transfer made after an event (before next event starts)."""
    user_id = get_current_user_id(authorization)

    # Verify team ownership
    team_response = (
        supabase.table("fantasy_teams")
        .select("*, leagues(discipline, gender)")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data
    if team["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You don't own this team")

    league = team.get("leagues") or {}

    # Get the transfer to revert
    transfer_response = (
        supabase.table("team_transfers")
        .select("*")
        .eq("team_id", str(team_id))
        .eq("after_event_id", after_event_id)
        .is_("reverted_at", "null")
        .execute()
    )

    if not transfer_response.data:
        raise HTTPException(
            status_code=404, detail="No active transfer found for this event"
        )

    # Check if window is still open
    event_response = (
        supabase.table("events").select("*").eq("id", after_event_id).single().execute()
    )

    if not event_response.data:
        raise HTTPException(status_code=404, detail="Event not found")

    event = event_response.data

    next_event = (
        supabase.table("events")
        .select("*")
        .eq("discipline", league.get("discipline"))
        .eq("gender", league.get("gender"))
        .gt("date", event["date"])
        .order("date", desc=False)
        .limit(1)
        .execute()
    )

    if next_event.data and len(next_event.data) > 0:
        next_event_data = next_event.data[0]
        if next_event_data["status"] in ["completed", "in_progress"]:
            raise HTTPException(status_code=400, detail="Transfer window has closed")

    # Revert all transfers for this event
    now = datetime.now(timezone.utc).isoformat()

    for transfer in transfer_response.data:
        # Remove the new climber
        supabase.table("team_roster").update({"removed_at": now}).eq(
            "team_id", str(team_id)
        ).eq("climber_id", transfer["climber_in_id"]).is_(
            "removed_at", "null"
        ).execute()

        # Re-add the old climber
        supabase.table("team_roster").insert(
            {
                "team_id": str(team_id),
                "climber_id": transfer["climber_out_id"],
                "is_captain": False,  # Will need to set captain manually
                "added_at": now,
            }
        ).execute()

        # Mark transfer as reverted
        supabase.table("team_transfers").update({"reverted_at": now}).eq(
            "id", transfer["id"]
        ).execute()

    return {"message": "Transfer(s) reverted successfully"}


@router.get("/{team_id}/transfers", response_model=List[TransferResponse])
def get_team_transfers(team_id: uuid.UUID):
    """Get all transfers for a team."""
    transfers_response = (
        supabase.table("team_transfers")
        .select(
            "*, climber_out:climbers!team_transfers_climber_out_id_fkey(name), climber_in:climbers!team_transfers_climber_in_id_fkey(name)"
        )
        .eq("team_id", str(team_id))
        .order("created_at", desc=True)
        .execute()
    )

    transfers = []
    for t in transfers_response.data or []:
        transfers.append(
            {
                "id": t["id"],
                "team_id": t["team_id"],
                "after_event_id": t["after_event_id"],
                "climber_out_id": t["climber_out_id"],
                "climber_in_id": t["climber_in_id"],
                "created_at": t["created_at"],
                "reverted_at": t.get("reverted_at"),
                "climber_out_name": (
                    t.get("climber_out", {}).get("name")
                    if t.get("climber_out")
                    else None
                ),
                "climber_in_name": (
                    t.get("climber_in", {}).get("name") if t.get("climber_in") else None
                ),
            }
        )

    return transfers
