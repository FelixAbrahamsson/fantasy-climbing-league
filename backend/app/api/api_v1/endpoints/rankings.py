"""
Rankings API endpoints for syncing and retrieving IFSC world rankings.
"""

from typing import Literal, Optional

from app.core.auth import get_current_user_id
from app.db.supabase import supabase
from app.services.ifsc_sdk import IFSCClient
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


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
