"""
Scoring API endpoint to serve scoring configuration to the frontend.
"""

from app.services.scoring import CAPTAIN_MULTIPLIER, IFSC_POINTS
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def get_scoring_config():
    """Get the current scoring configuration."""
    # Convert to list of {rank, points} for easier frontend consumption
    points_table = [
        {"rank": rank, "points": points} for rank, points in sorted(IFSC_POINTS.items())
    ]

    return {
        "points_table": points_table,
        "captain_multiplier": CAPTAIN_MULTIPLIER,
        "min_points": 1,  # Points for rank > 80
        "description": "IFSC Official World Cup Scoring System",
    }
