from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ClimberBase(BaseModel):
    name: str
    country: Optional[str] = None
    gender: Literal["men", "women"]


class ClimberResponse(ClimberBase):
    id: int  # IFSC ID

    model_config = {"from_attributes": True}


class TeamBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class TeamCreate(TeamBase):
    league_id: UUID


class TeamResponse(TeamBase):
    id: UUID
    league_id: UUID
    user_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class RosterEntry(BaseModel):
    climber_id: int
    is_captain: bool = False


class TeamRosterUpdate(BaseModel):
    roster: List[RosterEntry] = Field(
        ..., max_length=10
    )  # Max is validated against league.team_size


class TeamWithRoster(TeamResponse):
    roster: List[ClimberResponse] = []
    captain_id: Optional[int] = None
