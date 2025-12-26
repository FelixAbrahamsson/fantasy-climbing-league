from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class EventBase(BaseModel):
    name: str
    date: datetime
    discipline: Literal["boulder", "lead"]
    gender: Literal["men", "women"]


class EventResponse(EventBase):
    id: int  # IFSC ID
    status: Literal["upcoming", "completed"] = "upcoming"

    model_config = {"from_attributes": True}


class EventResultBase(BaseModel):
    event_id: int
    climber_id: int
    rank: int
    score: int


class EventResultResponse(EventResultBase):
    id: UUID

    model_config = {"from_attributes": True}
