#!/usr/bin/env python3
"""
CLI for Fantasy Climbing SDK.

Usage:
    fcl-sync --year 2025                    # Full sync for a year
    fcl-sync events --year 2025             # Sync events only
    fcl-sync athletes --year 2025           # Sync athletes only
    fcl-sync rankings --year 2025           # Sync rankings only
    fcl-sync results --year 2025            # Sync results only
    fcl-sync event-results --event-id 1410  # Sync specific event results
    fcl-sync setup-test-season              # Set up test data with shifted dates
    fcl-sync clear-data                     # Clear all data (CAUTION!)
    fcl-sync --backfill --years 3           # Backfill multiple years
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime

from .sync import (
    sync_all,
    sync_all_rankings,
    sync_all_results,
    sync_athletes,
    sync_event_results,
    sync_events,
    sync_registrations,
)
from .test_data import clear_all_data, setup_test_season

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def run_sync(args: argparse.Namespace) -> int:
    """Run the sync based on CLI arguments."""
    current_year = datetime.now().year

    if args.backfill:
        years_to_sync = range(current_year - args.years + 1, current_year + 1)
        logger.info(f"Backfilling {args.years} years: {list(years_to_sync)}")

        for year in years_to_sync:
            logger.info(f"\n{'='*50}\nSyncing {year}\n{'='*50}")
            results = await sync_all(year, world_cups_only=not args.all_events)
            _print_results(year, results)

        return 0

    year = args.year or current_year

    if args.command == "events":
        logger.info(f"Syncing events for {year}...")
        results = await sync_events(year, world_cups_only=not args.all_events)
        print(
            f"\n✅ Synced {results['events']} events ({results['categories']} categories)"
        )

    elif args.command == "athletes":
        logger.info(f"Syncing athletes for {year}...")
        results = await sync_athletes(year, world_cups_only=not args.all_events)
        print(
            f"\n✅ Synced {results['climbers']} athletes ({results['men']} men, {results['women']} women)"
        )

    elif args.command == "rankings":
        logger.info(f"Syncing rankings for {year}...")
        results = await sync_all_rankings(year)
        print(f"\n✅ Synced {results['synced_count']} ranking entries")

    elif args.command == "results":
        logger.info(f"Syncing results for {year}...")
        results = await sync_all_results(year)
        print(
            f"\n✅ Synced {results['results']} results from {results['events']} events"
        )

    elif args.command == "registrations":
        logger.info(f"Syncing registrations for {year}...")
        results = await sync_registrations(year, world_cups_only=not args.all_events)
        print(
            f"\n✅ Synced {results['registrations']} registrations from {results['events']} events"
        )

    elif args.command == "event-results":
        if not args.event_id:
            print("Error: --event-id is required for event-results command")
            return 1
        logger.info(f"Syncing results for event {args.event_id}...")
        results = await sync_event_results(args.event_id)
        print(
            f"\n✅ Synced {results['results']} results from {results['categories']} categories"
        )
        if results["errors"]:
            print(f"⚠️  Errors: {results['errors']}")

    elif args.command == "setup-test-season":
        num_past = args.num_past_events or 1
        days_between = args.days_between or 7
        logger.info(
            f"Setting up test season with {num_past} past events, "
            f"{days_between} days between events..."
        )
        results = await setup_test_season(
            year=year,
            num_past_events=num_past,
            days_between_events=days_between,
        )
        print(f"\n✅ Test season set up!")
        print(
            f"   Events: {results['events']} ({results['past_events']} past, {results['future_events']} future)"
        )
        print(f"   Climbers: {results['climbers']}")
        print(f"   Results: {results['results']}")
        if results["errors"]:
            print(f"⚠️  Errors: {len(results['errors'])}")

    elif args.command == "clear-data":
        print("⚠️  WARNING: This will delete ALL data from the database!")
        response = input("Are you sure? (y/N): ").strip().lower()
        if response != "y":
            print("Aborted.")
            return 1
        logger.info("Clearing all data...")
        results = clear_all_data()
        print("\n✅ All data cleared!")
        for table, count in results.items():
            if not table.endswith("_error"):
                print(f"   {table}: {count} records deleted")

    else:
        # Full sync
        logger.info(f"Running full sync for {year}...")
        results = await sync_all(year, world_cups_only=not args.all_events)
        _print_results(year, results)

    return 0


def _print_results(year: int, results: dict) -> None:
    """Print sync results summary."""
    print(f"\n{'='*50}")
    print(f"Sync Results for {year}")
    print(f"{'='*50}")

    if "events" in results:
        e = results["events"]
        print(
            f"Events:   {e.get('events', 0)} events, {e.get('categories', 0)} categories"
        )

    if "athletes" in results:
        a = results["athletes"]
        print(
            f"Athletes: {a.get('climbers', 0)} total ({a.get('men', 0)} men, {a.get('women', 0)} women)"
        )

    if "results" in results:
        r = results["results"]
        print(
            f"Results:  {r.get('results', 0)} results from {r.get('events', 0)} events"
        )

    if "rankings" in results:
        rk = results["rankings"]
        print(f"Rankings: {rk.get('synced_count', 0)} entries")

    # Print any errors
    all_errors = []
    for key, value in results.items():
        if isinstance(value, dict) and "errors" in value:
            all_errors.extend(value["errors"])

    if all_errors:
        print(f"\n⚠️  {len(all_errors)} errors occurred:")
        for error in all_errors[:5]:
            print(f"   - {error}")
        if len(all_errors) > 5:
            print(f"   ... and {len(all_errors) - 5} more")


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Fantasy Climbing League - IFSC Data Sync",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  fcl-sync                          # Full sync for current year
  fcl-sync --year 2025              # Full sync for 2025
  fcl-sync events --year 2025       # Sync only events
  fcl-sync athletes                 # Sync only athletes for current year
  fcl-sync event-results --event-id 1410  # Add results for specific event
  fcl-sync setup-test-season --num-past-events 2  # Set up test data
  fcl-sync clear-data --confirm     # Clear all data (CAUTION!)
  fcl-sync --backfill --years 3     # Backfill last 3 years
  fcl-sync --all-events             # Include non-World Cup events
        """,
    )

    parser.add_argument(
        "command",
        nargs="?",
        choices=[
            "events",
            "athletes",
            "rankings",
            "results",
            "registrations",
            "event-results",
            "setup-test-season",
            "clear-data",
        ],
        help="Specific sync command (default: full sync)",
    )

    parser.add_argument(
        "--event-id",
        type=int,
        help="IFSC event ID for event-results command (e.g., 1410)",
    )

    parser.add_argument(
        "--year",
        type=int,
        help="Season year to sync (default: current year)",
    )

    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Backfill multiple years",
    )

    parser.add_argument(
        "--years",
        type=int,
        default=3,
        help="Number of years to backfill (default: 3)",
    )

    parser.add_argument(
        "--all-events",
        action="store_true",
        help="Include all events, not just World Cups",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    # setup-test-season arguments
    parser.add_argument(
        "--num-past-events",
        type=int,
        default=1,
        help="Number of past events for setup-test-season (default: 1)",
    )

    parser.add_argument(
        "--days-between",
        type=int,
        default=7,
        help="Days between events for setup-test-season (default: 7)",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        return asyncio.run(run_sync(args))
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        return 1
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
