import logging
from typing import List
from uuid import UUID

from app.db.supabase import supabase
from app.services.scoring import calculate_climber_score
from pydantic import BaseModel

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
        # Get the event date to determine historical roster/captain
        event = (
            supabase.table("events")
            .select("date")
            .eq("id", event_id)
            .single()
            .execute()
        )

        if not event.data:
            return 0

        event_date = event.data["date"]

        # Get team roster at event time (climbers added before event, not removed or removed after event)
        roster = (
            supabase.table("team_roster")
            .select("climber_id")
            .eq("team_id", team_id)
            .lte("added_at", event_date)
            .execute()
        )

        if not roster.data:
            return 0

        # Filter roster to only include those not removed before event
        active_roster = []
        for entry in roster.data:
            # Re-query to check removed_at (Supabase doesn't easily do OR with NULL)
            detail = (
                supabase.table("team_roster")
                .select("climber_id, removed_at")
                .eq("team_id", team_id)
                .eq("climber_id", entry["climber_id"])
                .lte("added_at", event_date)
                .execute()
            )
            if detail.data:
                for d in detail.data:
                    # Include if not removed, or removed after event
                    if d.get("removed_at") is None or d["removed_at"] > event_date:
                        active_roster.append(d["climber_id"])
                        break

        if not active_roster:
            return 0

        # Get captain at event time from captain_history
        captain_id = None
        captain_history = (
            supabase.table("captain_history")
            .select("climber_id")
            .eq("team_id", team_id)
            .lte("set_at", event_date)
            .order("set_at", desc=True)
            .limit(1)
            .execute()
        )

        if captain_history.data:
            captain_id = captain_history.data[0]["climber_id"]

        total_score = 0

        for climber_id in active_roster:
            try:
                result = (
                    supabase.table("event_results")
                    .select("rank, score")
                    .eq("event_id", event_id)
                    .eq("climber_id", climber_id)
                    .execute()
                )

                if result.data and len(result.data) > 0:
                    result_data = result.data[0]
                    is_captain = climber_id == captain_id
                    score = calculate_climber_score(result_data["rank"], is_captain)
                    total_score += score
            except Exception as e:
                logger.warning(f"Error fetching result for climber {climber_id}: {e}")
                continue

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
