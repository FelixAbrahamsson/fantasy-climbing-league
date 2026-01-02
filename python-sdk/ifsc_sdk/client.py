"""
IFSC SDK Client

Async HTTP client for the IFSC Results API.
Handles session-based authentication automatically.
"""

import logging
import re
from datetime import datetime
from typing import Any, Optional

import httpx

from .models import (
    IFSCFullEvent,
    IFSCLeague,
    IFSCRegistration,
    IFSCResultsResponse,
    IFSCSeasonResponse,
)

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

    async def get_cuwr_rankings(
        self, cuwr_id: int, season: int
    ) -> list[dict[str, Any]]:
        """
        Fetch Combined Universal World Rankings.

        Args:
            cuwr_id: The CUWR category ID:
                1 = Lead Men, 3 = Boulder Men, 5 = Lead Women,
                7 = Boulder Women, 2 = Speed Men, 6 = Speed Women
            season: The season year

        Returns:
            List of ranking entries
        """
        season_id = SEASON_ID_MAP.get(season)
        if season_id is None:
            raise IFSCClientError(f"Unsupported season year: {season}")

        data = await self._authenticated_get(
            f"/world_ranking/cuwr/{cuwr_id}?season_id={season_id}"
        )
        return data


# Utility Functions


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
        Our schema value ('boulder', 'lead', 'speed') or None if not supported
    """
    kind_lower = kind.lower()
    if kind_lower in ("boulder", "lead", "speed"):
        return kind_lower
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
    if name_lower in ("men", "women"):
        return name_lower
    return None


def parse_event_date(date_str: str) -> datetime:
    """
    Parse IFSC date string to datetime.

    Args:
        date_str: Date string from IFSC API (e.g., '2025-03-07 11:00:00 UTC')

    Returns:
        Parsed datetime object
    """
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
    for league in leagues:
        if "World Cups" in league.name or "World Championships" in league.name:
            if f"/{league_season_id}" in league.url:
                return True
    return False
