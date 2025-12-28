# IFSC Official Scoring System
# Points awarded based on placement in World Cup events

IFSC_POINTS = {
    1: 1000,
    2: 805,
    3: 690,
    4: 610,
    5: 545,
    6: 495,
    7: 455,
    8: 415,
    9: 380,
    10: 350,
    11: 325,
    12: 300,
    13: 280,
    14: 260,
    15: 240,
    16: 220,
    17: 205,
    18: 185,
    19: 170,
    20: 155,
    21: 145,
    22: 130,
    23: 120,
    24: 105,
    25: 95,
    26: 84,
    27: 73,
    28: 63,
    29: 56,
    30: 48,
    31: 42,
    32: 37,
    33: 33,
    34: 30,
    35: 27,
    36: 24,
    37: 21,
    38: 19,
    39: 17,
    40: 15,
    41: 14,
    42: 13,
    43: 12,
    44: 11,
    45: 11,
    46: 10,
    47: 9,
    48: 9,
    49: 8,
    50: 8,
    51: 7,
    52: 7,
    53: 7,
    54: 6,
    55: 6,
    56: 6,
    57: 5,
    58: 5,
    59: 5,
    60: 4,
    61: 4,
    62: 4,
    63: 4,
    64: 3,
    65: 3,
    66: 3,
    67: 3,
    68: 3,
    69: 2,
    70: 2,
    71: 2,
    72: 2,
    73: 2,
    74: 2,
    75: 1,
    76: 1,
    77: 1,
    78: 1,
    79: 1,
    80: 1,
}

CAPTAIN_MULTIPLIER = 2  # Captain gets double points


def get_points_for_rank(rank: int) -> int:
    """Get points for a given placement rank."""
    if rank in IFSC_POINTS:
        return IFSC_POINTS[rank]
    elif rank > 80:
        return 1  # Minimum points for any placement beyond 80
    return 0


def calculate_climber_score(rank: int, is_captain: bool = False) -> int:
    """Calculate score for a climber including captain bonus."""
    base_points = get_points_for_rank(rank)
    if is_captain:
        return base_points * CAPTAIN_MULTIPLIER
    return base_points
