"""
IFSC SDK

A Python SDK for interacting with the IFSC Results API.
Handles authentication via session cookies and provides methods
to fetch seasons, events, and competition results.
"""

import logging
import re
from datetime import datetime
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# IFSC API Configuration
IFSC_BASE_URL = "https://ifsc.results.info"
IFSC_API_BASE = f"{IFSC_BASE_URL}/api/v1"
IFSC_SESSION_COOKIE_NAME = "_verticallife_resultservice_session"

# Season ID mapping (IFSC uses sequential IDs, not years)
SEASON_ID_MAP = {
    2024: 36,
    2025: 37,
    2026: 38,
}

# Default headers for requests
DEFAULT_HEADERS = {
    "accept": "application/json",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "referer": IFSC_BASE_URL + "/",
}


# ============================================================================
# Response Models
# ============================================================================


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

    # Convenience property to match the season event listing
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


# ============================================================================
# IFSC Client
# ============================================================================


class IFSCClientError(Exception):
    """Exception raised for IFSC API errors."""

    pass


class IFSCClient:
    """
    Client for interacting with the IFSC Results API.

    Handles session-based authentication automatically.
    """

    def __init__(self, timeout: float = 30.0):
        """
        Initialize the IFSC client.

        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self._session_cookie: Optional[str] = None

    async def _get_session_cookie(self) -> str:
        """
        Fetch a session cookie from the IFSC main page.

        Returns:
            The session cookie value

        Raises:
            IFSCClientError: If unable to obtain session cookie
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                IFSC_BASE_URL + "/",
                headers={"user-agent": DEFAULT_HEADERS["user-agent"]},
                follow_redirects=True,
            )

            # Extract session cookie from Set-Cookie header
            cookies = response.cookies
            if IFSC_SESSION_COOKIE_NAME in cookies:
                return cookies[IFSC_SESSION_COOKIE_NAME]

            # Try parsing from headers directly
            set_cookie = response.headers.get("set-cookie", "")
            match = re.search(rf"{IFSC_SESSION_COOKIE_NAME}=([^;]+)", set_cookie)
            if match:
                return match.group(1)

            raise IFSCClientError("Could not retrieve session cookie from IFSC")

    async def _ensure_session(self) -> str:
        """Ensure we have a valid session cookie."""
        if self._session_cookie is None:
            self._session_cookie = await self._get_session_cookie()
        return self._session_cookie

    async def _authenticated_get(self, endpoint: str) -> dict[str, Any]:
        """
        Make an authenticated GET request to the IFSC API.

        Args:
            endpoint: API endpoint (e.g., '/seasons/37')

        Returns:
            JSON response as dictionary

        Raises:
            IFSCClientError: If the request fails
        """
        session_cookie = await self._ensure_session()

        url = f"{IFSC_API_BASE}{endpoint}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                url,
                headers=DEFAULT_HEADERS,
                cookies={IFSC_SESSION_COOKIE_NAME: session_cookie},
            )

            if response.status_code == 401:
                # Session expired, try refreshing
                self._session_cookie = None
                session_cookie = await self._ensure_session()

                response = await client.get(
                    url,
                    headers=DEFAULT_HEADERS,
                    cookies={IFSC_SESSION_COOKIE_NAME: session_cookie},
                )

            if response.status_code != 200:
                raise IFSCClientError(
                    f"IFSC API request failed: {response.status_code} - {response.text}"
                )

            return response.json()

    async def get_season(self, year: int) -> IFSCSeasonResponse:
        """
        Fetch season data for a given year.

        Args:
            year: The season year (e.g., 2025)

        Returns:
            Season data including events list

        Raises:
            IFSCClientError: If the request fails or year is not supported
        """
        season_id = SEASON_ID_MAP.get(year)
        if season_id is None:
            raise IFSCClientError(
                f"Unsupported season year: {year}. "
                f"Supported years: {list(SEASON_ID_MAP.keys())}"
            )

        data = await self._authenticated_get(f"/seasons/{season_id}")
        return IFSCSeasonResponse(**data)

    async def get_event(self, event_id: int) -> IFSCFullEvent:
        """
        Fetch full event details.

        Args:
            event_id: The IFSC event ID

        Returns:
            Full event details including categories and disciplines
        """
        data = await self._authenticated_get(f"/events/{event_id}")
        return IFSCFullEvent(**data)

    async def get_event_results(
        self, event_id: int, dcat_id: int
    ) -> IFSCResultsResponse:
        """
        Fetch results for a specific event category.

        Args:
            event_id: The IFSC event ID
            dcat_id: The discipline category ID

        Returns:
            Results including full rankings
        """
        data = await self._authenticated_get(f"/events/{event_id}/result/{dcat_id}")
        return IFSCResultsResponse(**data)

    async def get_event_registrations(self, event_id: int) -> list[IFSCRegistration]:
        """
        Fetch all registered athletes for an event.

        Args:
            event_id: The IFSC event ID

        Returns:
            List of athlete registrations
        """
        data = await self._authenticated_get(f"/events/{event_id}/registrations")
        return [IFSCRegistration(**reg) for reg in data]


# ============================================================================
# Utility Functions
# ============================================================================


def year_to_season_id(year: int) -> int:
    """
    Convert a year to IFSC season ID.

    Args:
        year: The season year

    Returns:
        The IFSC season ID

    Raises:
        ValueError: If year is not supported
    """
    if year not in SEASON_ID_MAP:
        raise ValueError(
            f"Unsupported year: {year}. Supported: {list(SEASON_ID_MAP.keys())}"
        )
    return SEASON_ID_MAP[year]


def parse_discipline(kind: str) -> Optional[str]:
    """
    Map IFSC discipline kind to our schema values.

    Args:
        kind: IFSC discipline kind ('boulder', 'lead', 'speed', etc.)

    Returns:
        Our schema value ('boulder', 'lead') or None if not supported
    """
    kind_lower = kind.lower()
    if kind_lower == "boulder":
        return "boulder"
    elif kind_lower == "lead":
        return "lead"
    # Speed and combined are not currently supported in our schema
    return None


def parse_gender(category_name: str) -> Optional[str]:
    """
    Map IFSC category name to gender.

    Args:
        category_name: IFSC category name ('Men', 'Women')

    Returns:
        Gender value ('men', 'women') or None
    """
    name_lower = category_name.lower()
    if name_lower == "men":
        return "men"
    elif name_lower == "women":
        return "women"
    return None


def parse_event_date(date_str: str) -> datetime:
    """
    Parse IFSC date string to datetime.

    Args:
        date_str: Date string from IFSC API (e.g., '2025-03-07 11:00:00 UTC')

    Returns:
        Parsed datetime object
    """
    # Try common formats
    formats = [
        "%Y-%m-%d %H:%M:%S UTC",
        "%Y-%m-%d %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue

    # Fallback: try to parse just the date part
    date_part = date_str.split()[0] if " " in date_str else date_str
    return datetime.strptime(date_part, "%Y-%m-%d")


def is_world_cup_league(league_season_id: int, leagues: list[IFSCLeague]) -> bool:
    """
    Check if an event belongs to the World Cups and World Championships league.

    Args:
        league_season_id: The league season ID from the event
        leagues: List of leagues from the season

    Returns:
        True if this is a World Cup/Championship event
    """
    # World Cups league IDs typically follow a pattern
    # 2025: 443, 2026: 457, etc.
    # We can also check by URL pattern
    for league in leagues:
        if "World Cups" in league.name or "World Championships" in league.name:
            # Extract league ID from URL (e.g., '/api/v1/season_leagues/443')
            if f"/{league_season_id}" in league.url:
                return True
    return False
