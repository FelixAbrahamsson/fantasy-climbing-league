# Fantasy Climbing SDK

A Python SDK for Fantasy Climbing League that handles IFSC data synchronization and management.

## Installation

```bash
cd python-sdk
pip install -e .
# Or with poetry:
poetry install
```

## Configuration

Create a `.env` file in the `python-sdk` directory:

```env
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-service-role-key
```

**Important**: Use the service role key (not anon key) for server-side operations.

## Usage

### Sync all IFSC data for a season

```bash
fcl-sync --year 2025
```

### Sync specific data types

```bash
# Sync events only
fcl-sync events --year 2025

# Sync rankings
fcl-sync rankings --year 2025

# Sync athletes from registrations
fcl-sync athletes --year 2025

# Sync registrations (for transfer eligibility)
fcl-sync registrations --year 2025

# Sync results for a specific event
fcl-sync event-results --event-id 1410
```

### Backfill historical data

```bash
fcl-sync --backfill --years 3
```

## Package Structure

```
python-sdk/
├── ifsc_sdk/           # IFSC API client
│   ├── client.py       # HTTP client with session handling
│   └── models.py       # Response models
└── fantasy_climbing/   # Main package
    ├── db.py           # Supabase client wrapper
    ├── sync.py         # Sync orchestration
    ├── scoring.py      # Points calculation
    └── cli.py          # CLI entry point
```

## Development

```bash
poetry install
poetry run pytest
```
