from typing import List
from uuid import UUID

from app.db.supabase import supabase
from app.services.scoring import calculate_climber_score
from pydantic import BaseModel


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
    # Get team roster (at the time of the event - for now just active roster)
    roster = (
        supabase.table("team_roster")
        .select("climber_id, is_captain")
        .eq("team_id", team_id)
        .is_("removed_at", "null")
        .execute()
    )

    if not roster.data:
        return 0

    total_score = 0

    for entry in roster.data:
        # Get climber's result for this event
        result = (
            supabase.table("event_results")
            .select("rank, score")
            .eq("event_id", event_id)
            .eq("climber_id", entry["climber_id"])
            .single()
            .execute()
        )

        if result.data:
            score = calculate_climber_score(result.data["rank"], entry["is_captain"])
            total_score += score

    return total_score


def get_league_leaderboard(league_id: str) -> List[LeaderboardEntry]:
    """Calculate the full leaderboard for a league."""
    # Get all teams in the league
    teams = (
        supabase.table("fantasy_teams")
        .select("id, name, user_id, profiles(username)")
        .eq("league_id", league_id)
        .execute()
    )

    if not teams.data:
        return []

    # Get completed events for this league's discipline/gender
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
