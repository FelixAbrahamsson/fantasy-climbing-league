import asyncio
import os
import sys

# Add backend directory to path so we can import app.services
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.ifsc_data import populate_season_data


async def main():
    print("🚀 Starting Speed Event Sync...")

    # Sync 2025
    print("\n📅 Syncing 2025 Speed Events...")
    results_2025 = await populate_season_data(year=2025, disciplines=["speed"])
    print(f"✅ 2025 Results: {results_2025}")

    # Sync 2026 (Since user is in 2026)
    print("\n📅 Syncing 2026 Speed Events...")
    try:
        results_2026 = await populate_season_data(year=2026, disciplines=["speed"])
        print(f"✅ 2026 Results: {results_2026}")
    except Exception as e:
        print(f"⚠️ 2026 Sync Warning: {e}")


if __name__ == "__main__":
    asyncio.run(main())
