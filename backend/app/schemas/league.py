from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TierConfig(BaseModel):
    """Configuration for a single tier."""

    name: str = Field(..., min_length=1, max_length=10)
    max_rank: Optional[int] = Field(None, ge=1)  # None = unlimited (lowest tier)
    max_per_team: Optional[int] = Field(None, ge=0)  # None = unlimited


class TierConfigWrapper(BaseModel):
    """Wrapper for tier config as stored in database."""

    tiers: list[TierConfig] = []


DEFAULT_TIER_CONFIG = [
    TierConfig(name="S", max_rank=10, max_per_team=2),
    TierConfig(name="A", max_rank=30, max_per_team=2),
    TierConfig(name="B", max_rank=None, max_per_team=None),
]

DEFAULT_TIER_CONFIG_WRAPPER = TierConfigWrapper(tiers=DEFAULT_TIER_CONFIG)


class LeagueBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=50)
    gender: Literal["men", "women"]
    discipline: Literal["boulder", "lead"]


class LeagueCreate(LeagueBase):
    event_ids: list[int] = Field(
        default=[], description="List of event IDs to include in the league"
    )
    transfers_per_event: int = Field(
        default=1,
        ge=0,
        le=6,
        description="Number of transfers allowed after each event",
    )
    team_size: int = Field(
        default=6,
        ge=1,
        le=10,
        description="Number of athletes per team",
    )
    tier_config: list[TierConfig] = Field(
        default=DEFAULT_TIER_CONFIG,
        min_length=1,
        max_length=6,
        description="Tier configuration for athlete selection",
    )


class LeagueResponse(LeagueBase):
    id: UUID
    admin_id: UUID
    invite_code: Optional[str] = None
    created_at: datetime
    transfers_per_event: int = 1
    team_size: int = 6
    tier_config: TierConfigWrapper = DEFAULT_TIER_CONFIG_WRAPPER

    model_config = {"from_attributes": True}


class LeagueJoin(BaseModel):
    invite_code: str
