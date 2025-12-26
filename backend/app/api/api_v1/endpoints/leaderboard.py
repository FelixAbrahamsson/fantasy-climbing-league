import uuid
from typing import List

from app.services.leaderboard import LeaderboardEntry, get_league_leaderboard
from fastapi import APIRouter

router = APIRouter()


@router.get("/{league_id}", response_model=List[LeaderboardEntry])
def get_leaderboard(league_id: uuid.UUID):
    """Get the current leaderboard for a league."""
    return get_league_leaderboard(str(league_id))
