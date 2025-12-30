import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

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
from pydantic import TypeAdapter

router = APIRouter()


def get_athlete_tier(
    climber_id: int, rankings: dict[int, int], tier_config: list[dict]
) -> str:
    """Determine which tier an athlete belongs to based on their ranking."""
    rank = rankings.get(climber_id)

    # If no ranking found, athlete goes to the lowest tier
    if rank is None:
        return tier_config[-1]["name"]

    for tier in tier_config:
        max_rank = tier.get("max_rank")
        if max_rank is None or rank <= max_rank:
            return tier["name"]

    # Fallback to last tier
    return tier_config[-1]["name"]


def validate_roster_tier_limits(
    roster: List,
    tier_config: list[dict],
    discipline: str,
    gender: str,
):
    """
    Validate that the roster respects tier limits.

    Gets the current season's rankings and checks that the roster
    doesn't exceed any tier's max_per_team limit.
    """
    # Get current season (use current year)
    current_season = datetime.now().year

    # Fetch rankings for this discipline/gender/season
    climber_ids = [entry.climber_id for entry in roster]
    if not climber_ids:
        return

    rankings_response = (
        supabase.table("athlete_rankings")
        .select("climber_id, rank")
        .eq("discipline", discipline)
        .eq("gender", gender)
        .eq("season", current_season)
        .in_("climber_id", climber_ids)
        .execute()
    )

    rankings = {r["climber_id"]: r["rank"] for r in (rankings_response.data or [])}

    # Count athletes per tier
    tier_counts: dict[str, int] = {}
    for tier in tier_config:
        tier_counts[tier["name"]] = 0

    for entry in roster:
        tier_name = get_athlete_tier(entry.climber_id, rankings, tier_config)
        tier_counts[tier_name] = tier_counts.get(tier_name, 0) + 1

    # Validate against limits
    for tier in tier_config:
        tier_name = tier["name"]
        max_per_team = tier.get("max_per_team")

        # None means unlimited
        if max_per_team is not None and tier_counts.get(tier_name, 0) > max_per_team:
            raise HTTPException(
                status_code=400,
                detail=f"Too many {tier_name}-tier athletes (max {max_per_team}, got {tier_counts[tier_name]})",
            )


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


def check_roster_locked(league_id: str) -> dict:
    """Check if roster editing is locked for a league (first event started)."""
    # Get events in the league
    league_events = (
        supabase.table("league_events")
        .select("event_id")
        .eq("league_id", league_id)
        .execute()
    )

    if not league_events.data:
        return {"locked": False, "reason": None}

    event_ids = [le["event_id"] for le in league_events.data]

    # Check if any event has started (completed or in_progress)
    # OR if its start date has passed
    events_response = (
        supabase.table("events")
        .select("id, name, status, date")
        .in_("id", event_ids)
        .order("date", desc=False)
        .execute()
    )

    if not events_response.data:
        return {"locked": False, "reason": None}

    now = datetime.now(timezone.utc)
    date_adapter = TypeAdapter(datetime)

    for event in events_response.data:
        try:
            event_date = date_adapter.validate_python(event["date"])
        except Exception:
            # Fallback if parsing fails for some reason
            continue

        if event["status"] in ["completed", "in_progress"]:
            return {
                "locked": True,
                "reason": f"Event '{event['name']}' has started (Status: {event['status']})",
            }

        if event_date <= now:
            return {
                "locked": True,
                "reason": f"Event '{event['name']}' has started (Date: {event_date.strftime('%Y-%m-%d %H:%M')})",
            }

    return {"locked": False, "reason": None}


@router.get("/{team_id}/roster-status")
def get_roster_lock_status(team_id: uuid.UUID):
    """Check if a team's roster is locked (can only use transfers)."""
    team_response = (
        supabase.table("fantasy_teams")
        .select("league_id")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    return check_roster_locked(team_response.data["league_id"])


@router.put("/{team_id}/roster", response_model=TeamWithRoster)
def update_team_roster(
    team_id: uuid.UUID,
    roster_update: TeamRosterUpdate,
    authorization: str = Header(None),
):
    """Update the team's roster. Validates against league team_size and tier limits."""
    user_id = get_current_user_id(authorization)

    # Verify team belongs to user and get league info
    team_response = (
        supabase.table("fantasy_teams")
        .select("*, leagues(id, discipline, gender, team_size, tier_config)")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data
    league = team.get("leagues") or {}

    if team["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You don't own this team")

    # Check if roster is locked
    lock_status = check_roster_locked(team["league_id"])
    if lock_status["locked"]:
        raise HTTPException(
            status_code=403,
            detail=f"Roster is locked: {lock_status['reason']}. Use transfers to change your team.",
        )

    # Validate roster size against league team_size
    team_size = league.get("team_size", 6)
    if len(roster_update.roster) > team_size:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {team_size} climbers allowed in this league",
        )

    captains = [r for r in roster_update.roster if r.is_captain]
    if len(captains) != 1:
        raise HTTPException(status_code=400, detail="Exactly one captain required")

    # Validate tier limits
    tier_config = league.get("tier_config", {}).get("tiers", [])
    if tier_config:
        validate_roster_tier_limits(
            roster_update.roster,
            tier_config,
            league.get("discipline"),
            league.get("gender"),
        )

    # Mark all current roster entries as removed
    supabase.table("team_roster").update(
        {"removed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("team_id", str(team_id)).is_("removed_at", "null").execute()

    # Insert new roster entries
    now = datetime.now(timezone.utc).isoformat()
    for entry in roster_update.roster:
        supabase.table("team_roster").insert(
            {
                "team_id": str(team_id),
                "climber_id": entry.climber_id,
                "is_captain": entry.is_captain,
            }
        ).execute()

        if entry.is_captain:
            # Mark any existing captain history as replaced (though typically this is the first draft)
            supabase.table("captain_history").update({"replaced_at": now}).eq(
                "team_id", str(team_id)
            ).is_("replaced_at", "null").execute()

            # Record new captain
            supabase.table("captain_history").insert(
                {
                    "team_id": str(team_id),
                    "climber_id": entry.climber_id,
                    "set_at": now,
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

    # Verify team ownership and get league_id
    team_response = (
        supabase.table("fantasy_teams")
        .select("user_id, league_id")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data or team_response.data["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    league_id = team_response.data["league_id"]

    # Check if roster is locked
    lock_status = check_roster_locked(league_id)
    if lock_status["locked"]:
        raise HTTPException(
            status_code=403,
            detail=f"Roster is locked: {lock_status['reason']}. Users must use transfers to change captains mid-season.",
        )

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
        .select("*, leagues(discipline, gender, captain_multiplier)")
        .eq("id", str(team_id))
        .single()
        .execute()
    )

    if not team_response.data:
        raise HTTPException(status_code=404, detail="Team not found")

    team = team_response.data
    league = team.get("leagues") or {}
    captain_multiplier = league.get("captain_multiplier", 1.2)
    date_adapter = TypeAdapter(datetime)

    # Get FULL roster history with climber details (including is_captain for legacy fallback)
    roster_response = (
        supabase.table("team_roster")
        .select(
            "climber_id, is_captain, added_at, removed_at, climbers(id, name, country)"
        )
        .eq("team_id", str(team_id))
        .execute()
    )
    all_roster_entries = roster_response.data or []

    # Get FULL captain history
    captain_history_response = (
        supabase.table("captain_history")
        .select("climber_id, set_at, replaced_at")
        .eq("team_id", str(team_id))
        .execute()
    )
    all_captain_entries = captain_history_response.data or []

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
        event_date = date_adapter.validate_python(event["date"])

        # 1. Reconstruct roster for this event date
        active_roster = []
        active_climber_ids = []
        current_captain_id_for_event = None  # Fallback if no history
        for r in all_roster_entries:
            added_at = date_adapter.validate_python(r["added_at"])
            removed_at = (
                date_adapter.validate_python(r["removed_at"])
                if r.get("removed_at")
                else None
            )

            if added_at <= event_date and (not removed_at or removed_at > event_date):
                climber_data = r.get("climbers") or {}
                active_roster.append(
                    {
                        "id": climber_data.get("id"),
                        "name": climber_data.get("name", "Unknown"),
                        "country": climber_data.get("country"),
                        "is_captain_fallback": r.get("is_captain", False),
                    }
                )
                active_climber_ids.append(r["climber_id"])
                if r.get("is_captain"):
                    current_captain_id_for_event = r["climber_id"]

        # 2. Determine captain for this event date
        event_captain_id = None
        for ch in all_captain_entries:
            set_at = date_adapter.validate_python(ch["set_at"])
            replaced_at = (
                date_adapter.validate_python(ch["replaced_at"])
                if ch.get("replaced_at")
                else None
            )

            if set_at <= event_date and (not replaced_at or replaced_at > event_date):
                event_captain_id = ch["climber_id"]
                break

        # 2b. Fallback for teams with no history records yet
        if event_captain_id is None:
            event_captain_id = current_captain_id_for_event

        # 3. Get results for active climbers in this event
        results_response = (
            (
                supabase.table("event_results")
                .select("climber_id, rank, score")
                .eq("event_id", event_id)
                .in_("climber_id", active_climber_ids)
                .execute()
            )
            if active_climber_ids
            else {"data": []}
        )

        results_map = {
            r["climber_id"]: r
            for r in (
                results_response.data
                if hasattr(results_response, "data")
                else results_response.get("data", [])
            )
        }

        athlete_scores = []
        event_total = 0

        for climber in active_roster:
            climber_id = climber["id"]
            result = results_map.get(climber_id)
            is_captain = climber_id == event_captain_id
            multiplier = captain_multiplier if is_captain else 1.0

            if result:
                points = calculate_climber_score(result["rank"], multiplier)
                athlete_scores.append(
                    {
                        "climber_id": climber_id,
                        "climber_name": climber["name"],
                        "country": climber["country"],
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
                        "climber_name": climber["name"],
                        "country": climber["country"],
                        "is_captain": is_captain,
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
        "league_id": team["league_id"],
        "events": event_breakdown,
    }


@router.get("/league/{league_id}/event-breakdown")
def get_league_event_breakdown(league_id: uuid.UUID):
    """Get breakdown of all teams' scores per event for a league."""
    from app.services.scoring import calculate_climber_score

    # Get league info
    league_response = (
        supabase.table("leagues")
        .select("discipline, gender, captain_multiplier")
        .eq("id", str(league_id))
        .single()
        .execute()
    )

    if not league_response.data:
        raise HTTPException(status_code=404, detail="League not found")

    league = league_response.data
    captain_multiplier = league.get("captain_multiplier", 1.2)
    date_adapter = TypeAdapter(datetime)

    # Get all teams in the league
    teams_response = (
        supabase.table("fantasy_teams")
        .select("id, name, user_id, profiles(username)")
        .eq("league_id", str(league_id))
        .execute()
    )

    teams = teams_response.data or []
    team_ids = [t["id"] for t in teams]

    if not team_ids:
        return {"league_id": str(league_id), "events": []}

    # Get ALL roster history for all teams in this league
    all_rosters_response = (
        supabase.table("team_roster")
        .select(
            "team_id, climber_id, is_captain, added_at, removed_at, climbers(id, name, country)"
        )
        .in_("team_id", team_ids)
        .execute()
    )
    all_rosters = all_rosters_response.data or []

    # Get ALL captain history for all teams in this league
    all_captains_response = (
        supabase.table("captain_history")
        .select("team_id, climber_id, set_at, replaced_at")
        .in_("team_id", team_ids)
        .execute()
    )
    all_captains = all_captains_response.data or []

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
        event_date = date_adapter.validate_python(event["date"])

        # Get all results for this event
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
            team_id = team["id"]

            # 1. Determine active roster for this team at this event date
            active_roster = []
            active_climber_ids = []
            current_captain_id_for_event = None
            for r in all_rosters:
                if r["team_id"] != team_id:
                    continue

                added_at = date_adapter.validate_python(r["added_at"])
                removed_at = (
                    date_adapter.validate_python(r["removed_at"])
                    if r.get("removed_at")
                    else None
                )

                if added_at <= event_date and (
                    not removed_at or removed_at > event_date
                ):
                    climber_data = r.get("climbers") or {}
                    active_roster.append(
                        {
                            "id": climber_data.get("id"),
                            "name": climber_data.get("name", "Unknown"),
                            "country": climber_data.get("country"),
                        }
                    )
                    active_climber_ids.append(r["climber_id"])
                    if r.get("is_captain"):
                        current_captain_id_for_event = r["climber_id"]

            # 2. Determine active captain for this team at this event date
            event_captain_id = None
            for ch in all_captains:
                if ch["team_id"] != team_id:
                    continue

                set_at = date_adapter.validate_python(ch["set_at"])
                replaced_at = (
                    date_adapter.validate_python(ch["replaced_at"])
                    if ch.get("replaced_at")
                    else None
                )

                if set_at <= event_date and (
                    not replaced_at or replaced_at > event_date
                ):
                    event_captain_id = ch["climber_id"]
                    break

            # 2b. Fallback for teams with no history records yet
            if event_captain_id is None:
                event_captain_id = current_captain_id_for_event

            # 3. Calculate team totals
            athlete_scores = []
            team_total = 0

            for climber in active_roster:
                climber_id = climber["id"]
                result = results_map.get(climber_id)
                is_captain = climber_id == event_captain_id
                multiplier = captain_multiplier if is_captain else 1.0

                if result:
                    points = calculate_climber_score(result["rank"], multiplier)
                    team_total += points
                    athlete_scores.append(
                        {
                            "climber_id": climber_id,
                            "climber_name": climber["name"],
                            "country": climber["country"],
                            "is_captain": is_captain,
                            "rank": result["rank"],
                            "points": points,
                        }
                    )
                else:
                    athlete_scores.append(
                        {
                            "climber_id": climber_id,
                            "climber_name": climber["name"],
                            "country": climber["country"],
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
        .select("*, leagues(transfers_per_event, discipline, gender, tier_config)")
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

    # Get current captain
    current_captain_res = (
        supabase.table("team_roster")
        .select("climber_id")
        .eq("team_id", str(team_id))
        .eq("is_captain", True)
        .is_("removed_at", "null")
        .execute()
    )
    current_captain_id = (
        current_captain_res.data[0]["climber_id"] if current_captain_res.data else None
    )

    # Determine if the captain is actually changing
    # The captain changes if:
    #   a) The current captain is being removed (climber_out_id == current_captain_id)
    #   b) The user explicitly requested a new captain (new_captain_id is provided and different from current_captain_id)
    is_swapping_captain = (current_captain_id == transfer_in.climber_out_id) or (
        transfer_in.new_captain_id and transfer_in.new_captain_id != current_captain_id
    )

    if is_swapping_captain and not transfer_in.new_captain_id:
        raise HTTPException(
            status_code=400,
            detail="You must specify a new_captain_id when changing captains.",
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

    # Validate tier limits for the post-transfer roster
    tier_config = league.get("tier_config", {}).get("tiers", [])
    if tier_config:
        # Fetch current active roster
        current_roster_response = (
            supabase.table("team_roster")
            .select("climber_id")
            .eq("team_id", str(team_id))
            .is_("removed_at", "null")
            .execute()
        )

        current_roster_ids = [
            r["climber_id"] for r in (current_roster_response.data or [])
        ]

        # Simulate the roster change
        new_roster_ids = [
            mid for mid in current_roster_ids if mid != transfer_in.climber_out_id
        ]
        new_roster_ids.append(transfer_in.climber_in_id)

        # Create minimal objects for validation (function expects objects with climber_id attribute)
        class RosterEntry:
            def __init__(self, climber_id):
                self.climber_id = climber_id

        simulated_roster = [RosterEntry(cid) for cid in new_roster_ids]

        validate_roster_tier_limits(
            simulated_roster,
            tier_config,
            league.get("discipline"),
            league.get("gender"),
        )

    # Perform the transfer
    # Use the event date + 1 second as the history timestamp.
    # This ensures the transfer is strictly "after" the event, making it robust against shifted system time.

    event_time = TypeAdapter(datetime).validate_python(event["date"])
    history_ts = (event_time + timedelta(seconds=1)).isoformat()

    # Remove the old climber from roster
    supabase.table("team_roster").update({"removed_at": history_ts}).eq(
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
            "added_at": history_ts,
        }
    ).execute()

    # If swapping captain, update their captain status in roster and history
    if is_swapping_captain:
        # 1. Mark current captain as NOT captain in roster
        supabase.table("team_roster").update({"is_captain": False}).eq(
            "team_id", str(team_id)
        ).eq("is_captain", True).is_("removed_at", "null").execute()

        # 2. If new captain is an EXISTING member (not the one being added now), update their status
        if transfer_in.new_captain_id != transfer_in.climber_in_id:
            supabase.table("team_roster").update({"is_captain": True}).eq(
                "team_id", str(team_id)
            ).eq("climber_id", transfer_in.new_captain_id).is_(
                "removed_at", "null"
            ).execute()

        # 3. Record captain change in history
        supabase.table("captain_history").update({"replaced_at": history_ts}).eq(
            "team_id", str(team_id)
        ).is_("replaced_at", "null").execute()

        supabase.table("captain_history").insert(
            {
                "team_id": str(team_id),
                "climber_id": transfer_in.new_captain_id,
                "set_at": history_ts,
            }
        ).execute()

    # Record the transfer
    transfer_data = {
        "team_id": str(team_id),
        "after_event_id": transfer_in.after_event_id,
        "climber_out_id": transfer_in.climber_out_id,
        "climber_in_id": transfer_in.climber_in_id,
        "created_at": datetime.now(
            timezone.utc
        ).isoformat(),  # Use actual now for metadata
    }

    # cleanup any reverted transfers that would cause a unique constraint violation
    supabase.table("team_transfers").delete().eq("team_id", str(team_id)).eq(
        "after_event_id", transfer_in.after_event_id
    ).eq("climber_out_id", transfer_in.climber_out_id).not_.is_(
        "reverted_at", "null"
    ).execute()

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

    # Find the ACTUAL timestamp string used in the database for this transfer window.
    # We look for the added_at of one of the climbers coming IN.
    history_ts = None
    first_transfer = transfer_response.data[0]
    roster_ts_res = (
        supabase.table("team_roster")
        .select("added_at")
        .eq("team_id", str(team_id))
        .eq("climber_id", first_transfer["climber_in_id"])
        .is_("removed_at", "null")
        .order("added_at", desc=True)
        .limit(1)
        .execute()
    )

    if roster_ts_res.data:
        history_ts = roster_ts_res.data[0]["added_at"]
    else:
        # Fallback: Try finding a record that was REMOVED
        roster_ts_res = (
            supabase.table("team_roster")
            .select("removed_at")
            .eq("team_id", str(team_id))
            .eq("climber_id", first_transfer["climber_out_id"])
            .not_.is_("removed_at", "null")
            .order("removed_at", desc=True)
            .limit(1)
            .execute()
        )
        if roster_ts_res.data:
            history_ts = roster_ts_res.data[0]["removed_at"]

    # If we still don't have a timestamp, fall back to calculation (brittle but better than nothing)
    if not history_ts:
        event_time = TypeAdapter(datetime).validate_python(event["date"])
        history_ts = (event_time + timedelta(seconds=1)).isoformat()

    # 1. Revert team_roster changes made for this event window
    # Delete climbers added in this window
    supabase.table("team_roster").delete().eq("team_id", str(team_id)).eq(
        "added_at", history_ts
    ).execute()

    # Restore climbers removed in this window
    supabase.table("team_roster").update({"removed_at": None}).eq(
        "team_id", str(team_id)
    ).eq("removed_at", history_ts).execute()

    # 2. Revert captain history changes made for this event window
    # Delete new history records
    supabase.table("captain_history").delete().eq("team_id", str(team_id)).eq(
        "set_at", history_ts
    ).execute()

    # Restore old history records
    supabase.table("captain_history").update({"replaced_at": None}).eq(
        "team_id", str(team_id)
    ).eq("replaced_at", history_ts).execute()

    # 3. Mark transfers as reverted
    for transfer in transfer_response.data:
        supabase.table("team_transfers").update(
            {"reverted_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", transfer["id"]).execute()

    # 4. Synchronize team_roster is_captain flag with restored captain_history
    # We look for the LATEST record that has replaced_at is NULL (the restored one)
    restored_captain = (
        supabase.table("captain_history")
        .select("climber_id")
        .eq("team_id", str(team_id))
        .is_("replaced_at", "null")
        .order("set_at", desc=True)
        .limit(1)
        .execute()
    )

    if restored_captain.data and len(restored_captain.data) > 0:
        captain_id = restored_captain.data[0]["climber_id"]
        # Reset all
        supabase.table("team_roster").update({"is_captain": False}).eq(
            "team_id", str(team_id)
        ).is_("removed_at", "null").execute()
        # Set correct one
        supabase.table("team_roster").update({"is_captain": True}).eq(
            "team_id", str(team_id)
        ).eq("climber_id", captain_id).is_("removed_at", "null").execute()

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
