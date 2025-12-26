from app.api.api_v1.endpoints import climbers, events, leaderboard, leagues, teams
from fastapi import APIRouter

api_router = APIRouter()

api_router.include_router(leagues.router, prefix="/leagues", tags=["leagues"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(climbers.router, prefix="/climbers", tags=["climbers"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(
    leaderboard.router, prefix="/leaderboard", tags=["leaderboard"]
)
