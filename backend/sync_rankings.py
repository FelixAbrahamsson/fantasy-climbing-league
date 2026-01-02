#!/usr/bin/env python3
"""
Sync IFSC rankings to the database via the API.

Usage:
    # Sync a specific season
    poetry run python sync_rankings.py 2025

    # Backfill last 3 years (for initial setup)
    poetry run python sync_rankings.py --backfill

This script syncs all discipline/gender combinations for the specified season(s).
"""

import asyncio

import httpx

# API configuration - update if your API is running on a different port
API_BASE = "http://localhost:8000/api/v1"

# You'll need a valid JWT token from Supabase auth
# Get this from your browser's dev tools after logging in, or leave empty for local dev
AUTH_TOKEN = ""  # Optional: "Bearer eyJ..."

CUWR_COMBINATIONS = [
    ("boulder", "men"),
    ("boulder", "women"),
    ("lead", "men"),
    ("lead", "women"),
    ("speed", "men"),
    ("speed", "women"),
]

# Number of years to backfill when using --backfill
BACKFILL_YEARS = 3


async def sync_rankings(season: int):
    """Sync rankings for all discipline/gender combinations."""
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = AUTH_TOKEN

    async with httpx.AsyncClient(timeout=60.0) as client:
        for discipline, gender in CUWR_COMBINATIONS:
            print(f"\n🔄 Syncing {discipline} {gender} rankings for {season}...")

            try:
                response = await client.post(
                    f"{API_BASE}/rankings/sync",
                    params={
                        "season": season,
                        "discipline": discipline,
                        "gender": gender,
                    },
                    headers=headers,
                )

                if response.status_code == 200:
                    data = response.json()
                    print(f"   ✅ Synced {data['synced_count']} athletes")
                else:
                    print(f"   ❌ Failed: {response.status_code} - {response.text}")

            except Exception as e:
                print(f"   ❌ Error: {e}")


async def backfill_rankings(current_year: int, years: int = BACKFILL_YEARS):
    """Backfill rankings for the last N years."""
    print(
        f"📚 Backfilling {years} years of rankings ({current_year - years + 1} to {current_year})"
    )
    print("=" * 50)

    for year in range(current_year - years + 1, current_year + 1):
        print(f"\n📅 Season {year}")
        print("-" * 30)
        await sync_rankings(year)


if __name__ == "__main__":
    import sys
    from datetime import datetime

    current_year = datetime.now().year

    if len(sys.argv) > 1 and sys.argv[1] == "--backfill":
        print("🏔️  IFSC Rankings Backfill")
        print("=" * 40)
        asyncio.run(backfill_rankings(current_year - 1))
    else:
        # Use provided year or current year
        season = int(sys.argv[1]) if len(sys.argv) > 1 else current_year

        print(f"🏔️  IFSC Rankings Sync - Season {season}")
        print("=" * 40)
        asyncio.run(sync_rankings(season))

    print("\n✨ Done!")
