"""IFSC SDK - Python client for the IFSC Results API."""

from .client import IFSCClient, IFSCClientError
from .models import (
    IFSCAthleteResult,
    IFSCCategoryInfo,
    IFSCCategoryRound,
    IFSCDiscipline,
    IFSCEventInfo,
    IFSCFullEvent,
    IFSCLeague,
    IFSCRegistration,
    IFSCResultsResponse,
    IFSCSeasonResponse,
)

__all__ = [
    "IFSCClient",
    "IFSCClientError",
    "IFSCAthleteResult",
    "IFSCCategoryInfo",
    "IFSCCategoryRound",
    "IFSCDiscipline",
    "IFSCEventInfo",
    "IFSCFullEvent",
    "IFSCLeague",
    "IFSCRegistration",
    "IFSCResultsResponse",
    "IFSCSeasonResponse",
]
