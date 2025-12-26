# IFSC Official Scoring System
# Points awarded based on placement in World Cup events

IFSC_POINTS = {
    1: 1000,  # Gold
    2: 805,  # Silver
    3: 655,  # Bronze
    4: 540,
    5: 445,
    6: 365,
    7: 300,
    8: 245,
    # Semi-final placements (9-20)
    9: 200,
    10: 180,
    11: 165,
    12: 155,
    13: 145,
    14: 135,
    15: 125,
    16: 115,
    17: 105,
    18: 95,
    19: 85,
    20: 75,
    # Qualification round (21-26)
    21: 65,
    22: 60,
    23: 55,
    24: 50,
    25: 45,
    26: 40,
}

CAPTAIN_BONUS = 0.20  # 20% extra points for captain


def get_points_for_rank(rank: int) -> int:
    """Get points for a given placement rank."""
    if rank in IFSC_POINTS:
        return IFSC_POINTS[rank]
    elif rank > 26:
        # All placements beyond 26th get minimal points
        return max(5, 40 - (rank - 26) * 2)
    return 0


def calculate_climber_score(rank: int, is_captain: bool = False) -> int:
    """Calculate score for a climber including captain bonus."""
    base_points = get_points_for_rank(rank)
    if is_captain:
        return int(base_points * (1 + CAPTAIN_BONUS))
    return base_points
