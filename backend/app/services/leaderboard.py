import logging
from datetime import datetime
from typing import List
from uuid import UUID

from app.db.supabase import supabase
from app.services.scoring import calculate_climber_score
from pydantic import BaseModel, TypeAdapter

logger = logging.getLogger(__name__)


class LeaderboardEntry(BaseModel):
    rank: int
    team_id: UUID
    team_name: str
    user_id: UUID
    username: str | None = None
    total_score: int
    event_scores: dict[int, int] = {}  # event_id -> score


def calculate_team_score_for_event(team_id: str, event_id: int) -> int:
    """Calculate a team's score for a specific event."""
    try:
        # Get the event date and league info
        team = (
            supabase.table("fantasy_teams")
            .select("league_id, leagues(captain_multiplier)")
            .eq("id", team_id)
            .single()
            .execute()
        )

        if not team.data:
            return 0

        league = team.data.get("leagues") or {}
        captain_multiplier = league.get("captain_multiplier", 1.2)
        date_adapter = TypeAdapter(datetime)

        event = (
            supabase.table("events")
            .select("date")
            .eq("id", event_id)
            .single()
            .execute()
        )

        if not event.data:
            return 0

        event_date = date_adapter.validate_python(event.data["date"])

        # Get all roster entries for this team to find the active ones
        roster_response = (
            supabase.table("team_roster")
            .select("climber_id, is_captain, added_at, removed_at")
            .eq("team_id", team_id)
            .execute()
        )

        if not roster_response.data:
            return 0

        active_climber_ids = []
        current_captain_id_for_event = None
        for r in roster_response.data:
            added_at = date_adapter.validate_python(r["added_at"])
            removed_at = (
                date_adapter.validate_python(r["removed_at"])
                if r.get("removed_at")
                else None
            )

            if added_at <= event_date and (not removed_at or removed_at > event_date):
                active_climber_ids.append(r["climber_id"])
                if r.get("is_captain"):
                    current_captain_id_for_event = r["climber_id"]

        if not active_climber_ids:
            return 0

        # Get captain history to find the active captain at event time
        captain_history_response = (
            supabase.table("captain_history")
            .select("climber_id, set_at, replaced_at")
            .eq("team_id", team_id)
            .execute()
        )

        captain_id = None
        for ch in captain_history_response.data or []:
            set_at = date_adapter.validate_python(ch["set_at"])
            replaced_at = (
                date_adapter.validate_python(ch["replaced_at"])
                if ch.get("replaced_at")
                else None
            )

            if set_at <= event_date and (not replaced_at or replaced_at > event_date):
                captain_id = ch["climber_id"]
                break

        if captain_id is None:
            captain_id = current_captain_id_for_event

        # Bulk fetch results for all active climbers
        results_response = (
            supabase.table("event_results")
            .select("climber_id, rank")
            .eq("event_id", event_id)
            .in_("climber_id", active_climber_ids)
            .execute()
        )

        total_score = 0
        results_map = {
            r["climber_id"]: r["rank"] for r in (results_response.data or [])
        }

        for climber_id in active_climber_ids:
            rank = results_map.get(climber_id)
            if rank is not None:
                is_captain = climber_id == captain_id
                multiplier = captain_multiplier if is_captain else 1.0
                total_score += calculate_climber_score(rank, multiplier)

        return total_score
    except Exception as e:
        logger.error(
            f"Error calculating score for team {team_id}, event {event_id}: {e}"
        )
        return 0


def get_league_leaderboard(league_id: str) -> List[LeaderboardEntry]:
    """Calculate the full leaderboard for a league."""
    try:
        # Get all teams in the league
        teams = (
            supabase.table("fantasy_teams")
            .select("id, name, user_id, profiles(username)")
            .eq("league_id", league_id)
            .execute()
        )

        if not teams.data:
            return []

        # Get events specifically assigned to this league
        league_events = (
            supabase.table("league_events")
            .select("event_id")
            .eq("league_id", league_id)
            .execute()
        )

        if league_events.data:
            # Use only the events assigned to this league
            league_event_ids = [le["event_id"] for le in league_events.data]
            # Filter to completed events only
            events = (
                supabase.table("events")
                .select("id")
                .in_("id", league_event_ids)
                .eq("status", "completed")
                .execute()
            )
            completed_event_ids = [e["id"] for e in (events.data or [])]
        else:
            # Fallback: if no events assigned, use all completed events matching league discipline/gender
            league = (
                supabase.table("leagues")
                .select("discipline, gender")
                .eq("id", league_id)
                .single()
                .execute()
            )

            if not league.data:
                return []

            events = (
                supabase.table("events")
                .select("id")
                .eq("discipline", league.data["discipline"])
                .eq("gender", league.data["gender"])
                .eq("status", "completed")
                .execute()
            )
            completed_event_ids = [e["id"] for e in (events.data or [])]

        # Calculate scores for each team
        leaderboard = []

        for team in teams.data:
            total_score = 0
            event_scores = {}

            for event_id in completed_event_ids:
                event_score = calculate_team_score_for_event(team["id"], event_id)
                event_scores[event_id] = event_score
                total_score += event_score

            profile = team.get("profiles") or {}
            leaderboard.append(
                LeaderboardEntry(
                    rank=0,  # Will be set after sorting
                    team_id=team["id"],
                    team_name=team["name"],
                    user_id=team["user_id"],
                    username=profile.get("username"),
                    total_score=total_score,
                    event_scores=event_scores,
                )
            )

        # Sort by total score descending
        leaderboard.sort(key=lambda x: x.total_score, reverse=True)

        # Assign ranks
        for i, entry in enumerate(leaderboard):
            entry.rank = i + 1

        return leaderboard
    except Exception as e:
        logger.error(f"Error calculating leaderboard for league {league_id}: {e}")
        return []
