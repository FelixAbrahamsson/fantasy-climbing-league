"""
Rankings API endpoints for syncing and retrieving IFSC world rankings.
"""

from datetime import datetime
from typing import Literal, Optional

from app.core.auth import get_current_user_id
from app.db.supabase import supabase
from app.services.ifsc_sdk import IFSCClient
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()

# Number of seasons to look back for effective ranking calculation
SEASONS_LOOKBACK = 3

# Age penalty per year (0.1 means rank 5 from 2 years ago becomes 5.2)
AGE_PENALTY_PER_YEAR = 0.1


# CUWR ID mapping for discipline + gender combinations
CUWR_IDS = {
    ("lead", "men"): 1,
    ("boulder", "men"): 3,
    ("lead", "women"): 5,
    ("boulder", "women"): 7,
    ("speed", "men"): 2,
    ("speed", "women"): 6,
}


class RankingEntry(BaseModel):
    """A single ranking entry."""

    climber_id: int
    name: str
    country: str
    rank: int
    score: Optional[float] = None


class EffectiveRankingEntry(BaseModel):
    """Effective ranking combining last N seasons with age penalty."""

    climber_id: int
    name: str
    country: str
    effective_rank: float  # Float due to age penalty
    best_season: int  # Which season the best rank came from
    original_rank: int  # The original rank from best_season


class SyncResponse(BaseModel):
    """Response from sync operation."""

    synced_count: int
    discipline: str
    gender: str
    season: int


@router.post("/sync", response_model=SyncResponse)
async def sync_rankings(
    season: int = Query(..., ge=2020, le=2030, description="Season year to sync"),
    discipline: Literal["boulder", "lead", "speed"] = Query(
        ..., description="Discipline"
    ),
    gender: Literal["men", "women"] = Query(..., description="Gender category"),
):
    """
    Sync IFSC world rankings for a specific discipline/gender/season.

    This is an admin-only endpoint that fetches the current CUWR rankings
    from the IFSC API and stores them in the database.

    Note: No authentication required - meant to be run by admin locally.
    """

    # Get CUWR ID for this discipline/gender
    cuwr_id = CUWR_IDS.get((discipline, gender))
    if cuwr_id is None:
        raise HTTPException(400, f"Invalid discipline/gender combination")

    # Fetch rankings from IFSC API
    client = IFSCClient()
    try:
        data = await client._authenticated_get(f"/cuwr/{cuwr_id}")
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch rankings from IFSC: {str(e)}")

    if "ranking" not in data:
        raise HTTPException(502, "Invalid response from IFSC API")

    rankings = data["ranking"]

    # First, ensure all climbers exist in the climbers table
    synced_count = 0
    for entry in rankings:
        athlete_id = entry.get("athlete_id")
        name = entry.get("name")
        country = entry.get("country")
        rank = entry.get("rank")
        score = entry.get("score")

        if not athlete_id or not rank:
            continue

        # Upsert climber
        supabase.table("climbers").upsert(
            {
                "id": athlete_id,
                "name": name,
                "country": country,
                "gender": gender,
                "active": True,
            },
            on_conflict="id",
        ).execute()

        # Upsert ranking
        score_value = float(score) if score else None
        supabase.table("athlete_rankings").upsert(
            {
                "climber_id": athlete_id,
                "discipline": discipline,
                "gender": gender,
                "season": season,
                "rank": rank,
                "score": score_value,
            },
            on_conflict="climber_id,discipline,gender,season",
        ).execute()

        synced_count += 1

    return SyncResponse(
        synced_count=synced_count,
        discipline=discipline,
        gender=gender,
        season=season,
    )


@router.get("/{discipline}/{gender}/{season}", response_model=list[RankingEntry])
async def get_rankings(
    discipline: Literal["boulder", "lead", "speed"],
    gender: Literal["men", "women"],
    season: int,
    limit: int = Query(100, ge=1, le=500),
):
    """
    Get stored rankings for a discipline/gender/season.
    """
    response = (
        supabase.table("athlete_rankings")
        .select("climber_id, rank, score, climbers(name, country)")
        .eq("discipline", discipline)
        .eq("gender", gender)
        .eq("season", season)
        .order("rank")
        .limit(limit)
        .execute()
    )

    if not response.data:
        return []

    result = []
    for entry in response.data:
        climber = entry.get("climbers", {})
        result.append(
            RankingEntry(
                climber_id=entry["climber_id"],
                name=climber.get("name", "Unknown"),
                country=climber.get("country", ""),
                rank=entry["rank"],
                score=entry.get("score"),
            )
        )

    return result


@router.get("/{discipline}/{gender}/{season}/tier/{climber_id}")
async def get_athlete_tier(
    discipline: Literal["boulder", "lead", "speed"],
    gender: Literal["men", "women"],
    season: int,
    climber_id: int,
    tier_config: str = Query(
        default='[{"name":"S","max_rank":10},{"name":"A","max_rank":30},{"name":"B","max_rank":null}]',
        description="JSON tier configuration",
    ),
):
    """
    Get the tier for a specific athlete based on their ranking.
    """
    import json

    # Parse tier config
    try:
        tiers = json.loads(tier_config)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid tier_config JSON")

    # Get athlete ranking
    response = (
        supabase.table("athlete_rankings")
        .select("rank")
        .eq("climber_id", climber_id)
        .eq("discipline", discipline)
        .eq("gender", gender)
        .eq("season", season)
        .single()
        .execute()
    )

    # If no ranking found, return lowest tier
    if not response.data:
        return {"tier": tiers[-1]["name"], "rank": None}

    rank = response.data["rank"]

    # Determine tier based on rank
    for tier in tiers:
        max_rank = tier.get("max_rank")
        if max_rank is None or rank <= max_rank:
            return {"tier": tier["name"], "rank": rank}

    # Fallback to last tier
    return {"tier": tiers[-1]["name"], "rank": rank}


def calculate_effective_rank(
    rankings_by_season: dict[int, int],
    current_season: int,
) -> tuple[float, int, int] | None:
    """
    Calculate effective rank from multiple seasons with age penalty.

    Args:
        rankings_by_season: Dict mapping season year to rank
        current_season: The current season year

    Returns:
        Tuple of (effective_rank, best_season, original_rank) or None if no data
    """
    if not rankings_by_season:
        return None

    best_effective = None
    best_season = None
    best_original = None

    for season, rank in rankings_by_season.items():
        years_ago = current_season - season
        effective = rank + (AGE_PENALTY_PER_YEAR * years_ago)

        if best_effective is None or effective < best_effective:
            best_effective = effective
            best_season = season
            best_original = rank

    return (best_effective, best_season, best_original)


def get_effective_rankings_bulk(
    discipline: str,
    gender: str,
    current_season: int,
    seasons_lookback: int = SEASONS_LOOKBACK,
) -> dict[int, tuple[float, int, int]]:
    """
    Get effective rankings for all athletes in a discipline/gender.

    Returns dict mapping climber_id to (effective_rank, best_season, original_rank)
    """
    seasons = list(range(current_season, current_season - seasons_lookback, -1))

    response = (
        supabase.table("athlete_rankings")
        .select("climber_id, rank, season")
        .eq("discipline", discipline)
        .eq("gender", gender)
        .in_("season", seasons)
        .execute()
    )

    if not response.data:
        return {}

    # Group by climber_id
    climber_seasons: dict[int, dict[int, int]] = {}
    for entry in response.data:
        climber_id = entry["climber_id"]
        if climber_id not in climber_seasons:
            climber_seasons[climber_id] = {}
        climber_seasons[climber_id][entry["season"]] = entry["rank"]

    # Calculate effective rank for each climber
    result = {}
    for climber_id, seasons_data in climber_seasons.items():
        effective = calculate_effective_rank(seasons_data, current_season)
        if effective:
            result[climber_id] = effective

    return result


@router.get(
    "/{discipline}/{gender}/effective", response_model=list[EffectiveRankingEntry]
)
async def get_effective_rankings(
    discipline: Literal["boulder", "lead", "speed"],
    gender: Literal["men", "women"],
    limit: int = Query(500, ge=1, le=1000),
):
    """
    Get effective rankings combining last 3 seasons with age penalty.

    Athletes are ranked by their best performance across the last 3 seasons,
    with a small penalty (0.1 per year) applied to older results for tiebreaking.
    This ensures athletes who skip a season maintain their tier status.
    """
    current_season = datetime.now().year

    # Get effective rankings
    effective_rankings = get_effective_rankings_bulk(discipline, gender, current_season)

    if not effective_rankings:
        return []

    # Get climber info
    climber_ids = list(effective_rankings.keys())
    climbers_response = (
        supabase.table("climbers")
        .select("id, name, country")
        .in_("id", climber_ids)
        .execute()
    )

    climbers_map = {c["id"]: c for c in (climbers_response.data or [])}

    # Build result
    result = []
    for climber_id, (
        effective_rank,
        best_season,
        original_rank,
    ) in effective_rankings.items():
        climber = climbers_map.get(climber_id, {})
        result.append(
            EffectiveRankingEntry(
                climber_id=climber_id,
                name=climber.get("name", "Unknown"),
                country=climber.get("country", ""),
                effective_rank=effective_rank,
                best_season=best_season,
                original_rank=original_rank,
            )
        )

    # Sort by effective rank and limit
    result.sort(key=lambda x: x.effective_rank)
    return result[:limit]
