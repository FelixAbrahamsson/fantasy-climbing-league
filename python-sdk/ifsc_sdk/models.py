"""
IFSC SDK Response Models

Pydantic models for parsing IFSC API responses.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class IFSCDiscipline(BaseModel):
    """Discipline information from an event."""

    id: int
    kind: str  # 'boulder', 'lead', 'speed'
    settings: Optional[dict] = None


class IFSCEventInfo(BaseModel):
    """Event information from season listing."""

    event: str  # Event name
    event_id: int
    location: str
    country: str
    starts_at: str
    ends_at: str
    local_start_date: str
    local_end_date: str
    league_season_id: int
    url: str
    disciplines: list[IFSCDiscipline] = []


class IFSCLeague(BaseModel):
    """League information from season."""

    name: str
    url: str


class IFSCSeasonResponse(BaseModel):
    """Response from /api/v1/seasons/{id}."""

    name: str
    leagues: list[IFSCLeague] = []
    events: list[IFSCEventInfo] = []


class IFSCAthleteResult(BaseModel):
    """Individual athlete ranking entry."""

    athlete_id: int
    rank: Optional[int] = None
    name: str
    firstname: str
    lastname: str
    country: str
    flag_url: Optional[str] = None
    bib: Optional[str] = None
    federation_id: Optional[int] = None
    paraclimbing_sport_class: Optional[str] = None
    sport_class_status: Optional[str] = None
    rounds: list[dict] = []
    qualified: Optional[bool] = None


class IFSCCategoryRound(BaseModel):
    """Round information within a category."""

    category_round_id: int
    kind: str
    name: str  # 'Qualification', 'Semi-Final', 'Final'
    category: str  # 'Men', 'Women'
    status: str
    result_url: Optional[str] = None
    format: Optional[str] = None


class IFSCCategoryInfo(BaseModel):
    """Category (dcat) information from event details."""

    dcat_id: int
    event_id: int
    dcat_name: str  # e.g., 'BOULDER Men', 'LEAD Women'
    discipline_kind: str
    category_name: str  # 'Men', 'Women'
    status: str
    full_results_url: str
    category_rounds: list[IFSCCategoryRound] = []
    top_3_results: Optional[list[IFSCAthleteResult]] = []


class IFSCFullEvent(BaseModel):
    """Full event details from /api/v1/events/{id}."""

    id: int = Field(..., alias="id")
    name: str = Field(..., alias="name")
    location: str
    country: str
    starts_at: str
    ends_at: str
    local_start_date: str
    local_end_date: str
    d_cats: list[IFSCCategoryInfo] = Field(default=[], alias="d_cats")
    disciplines: list[IFSCDiscipline] = []

    @property
    def event_id(self) -> int:
        return self.id

    @property
    def event(self) -> str:
        return self.name

    model_config = {"populate_by_name": True}


class IFSCResultsResponse(BaseModel):
    """Response from /api/v1/events/{event_id}/result/{dcat_id}."""

    event: str
    dcat: str
    status: str
    ranking: list[IFSCAthleteResult] = []
    category_rounds: list[IFSCCategoryRound] = []


class IFSCRegistrationDcat(BaseModel):
    """Discipline category registration status."""

    id: int
    name: str  # e.g., 'BOULDER Women', 'LEAD Men'
    status: Optional[str] = None  # 'confirmed', 'not attending', etc.


class IFSCRegistration(BaseModel):
    """Athlete registration from /api/v1/events/{event_id}/registrations."""

    athlete_id: int
    firstname: str
    lastname: str
    name: str  # Full name in format "LASTNAME Firstname"
    gender: int  # 0 = men, 1 = women
    country: str
    federation: Optional[str] = None
    federation_id: Optional[int] = None
    d_cats: list[IFSCRegistrationDcat] = []


# CUWR (Combined Universal World Rankings) Models


class IFSCRankingEntry(BaseModel):
    """Entry in CUWR rankings."""

    rank: int
    athlete_id: int
    name: str
    firstname: str
    lastname: str
    country: str
    score: Optional[float] = None
