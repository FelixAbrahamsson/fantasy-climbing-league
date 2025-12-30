#!/usr/bin/env python3
"""
Sync IFSC rankings to the database via the API.

Usage:
    poetry run python sync_rankings.py

This script syncs all 4 discipline/gender combinations for the current season.
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
]


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


if __name__ == "__main__":
    import sys

    # Use current year as default season
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

    print(f"🏔️  IFSC Rankings Sync - Season {season}")
    print("=" * 40)

    asyncio.run(sync_rankings(season))

    print("\n✨ Done!")
