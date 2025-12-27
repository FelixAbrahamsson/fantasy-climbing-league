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


class LeagueResponse(LeagueBase):
    id: UUID
    admin_id: UUID
    invite_code: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeagueJoin(BaseModel):
    invite_code: str
