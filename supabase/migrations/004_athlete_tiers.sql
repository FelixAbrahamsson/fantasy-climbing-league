-- Migration: Add athlete rankings and tier configuration
-- Created: 2025-12-30

-- Athlete rankings table to store IFSC world rankings per season
create table if not exists public.athlete_rankings (
  id uuid default gen_random_uuid() primary key,
  climber_id integer references public.climbers(id) on delete cascade not null,
  discipline text check (discipline in ('boulder', 'lead')) not null,
  gender text check (gender in ('men', 'women')) not null,
  season integer not null,  -- e.g., 2025
  rank integer not null,
  score decimal(10,2),
  synced_at timestamp with time zone default timezone('utc'::text, now()),
  unique(climber_id, discipline, gender, season)
);

-- Add tier configuration to leagues table
alter table public.leagues 
add column if not exists team_size integer default 6 check (team_size >= 1 and team_size <= 10);

alter table public.leagues 
add column if not exists tier_config jsonb default '{
  "tiers": [
    {"name": "S", "max_rank": 10, "max_per_team": 2},
    {"name": "A", "max_rank": 30, "max_per_team": 2},
    {"name": "B", "max_rank": null, "max_per_team": null}
  ]
}'::jsonb;

-- Create index for efficient ranking lookups
create index if not exists idx_athlete_rankings_lookup 
on public.athlete_rankings(discipline, gender, season, rank);

create index if not exists idx_athlete_rankings_climber 
on public.athlete_rankings(climber_id, season);
