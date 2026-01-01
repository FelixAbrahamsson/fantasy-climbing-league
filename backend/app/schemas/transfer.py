from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class TransferCreate(BaseModel):
    after_event_id: int
    climber_out_id: int
    climber_in_id: int
    new_captain_id: Optional[int] = None  # Required if swapping out the captain


class TransferResponse(BaseModel):
    id: UUID
    team_id: UUID
    after_event_id: int
    climber_out_id: int
    climber_in_id: int
    created_at: datetime
    reverted_at: Optional[datetime] = None
    is_free: bool = False
    climber_out_name: Optional[str] = None
    climber_in_name: Optional[str] = None

    model_config = {"from_attributes": True}
