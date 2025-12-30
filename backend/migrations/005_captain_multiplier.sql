-- Migration: Add configurable captain multiplier to leagues
-- Created: 2025-12-30

-- Add captain_multiplier column to leagues table
-- Default is 1.2 (20% bonus), can range from 1.0 (no bonus) to 3.0 (triple)
alter table public.leagues 
add column if not exists captain_multiplier decimal(3,2) default 1.2 
check (captain_multiplier >= 1.0 and captain_multiplier <= 3.0);
