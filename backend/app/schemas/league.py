from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


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


class LeagueResponse(LeagueBase):
    id: UUID
    admin_id: UUID
    invite_code: Optional[str] = None
    created_at: datetime
    transfers_per_event: int = 1

    model_config = {"from_attributes": True}


class LeagueJoin(BaseModel):
    invite_code: str
