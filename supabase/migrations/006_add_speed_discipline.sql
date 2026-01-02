-- Migration: Add 'speed' to allowed disciplines
-- Description: Update CHECK constraints on leagues, events, and rankings tables to allow 'speed'

BEGIN;

-- 1. Update leagues table
-- First drop the existing constraint
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_discipline_check;

-- Add the new constraint including 'speed'
ALTER TABLE public.leagues 
  ADD CONSTRAINT leagues_discipline_check 
  CHECK (discipline IN ('boulder', 'lead', 'speed'));

-- 2. Update events table
-- First drop the existing constraint
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_discipline_check;

-- Add the new constraint including 'speed'
ALTER TABLE public.events 
  ADD CONSTRAINT events_discipline_check 
  CHECK (discipline IN ('boulder', 'lead', 'speed'));

-- 3. Update athlete_rankings table
-- First drop the existing constraint
ALTER TABLE public.athlete_rankings DROP CONSTRAINT IF EXISTS athlete_rankings_discipline_check;

-- Add the new constraint including 'speed'
ALTER TABLE public.athlete_rankings 
  ADD CONSTRAINT athlete_rankings_discipline_check 
  CHECK (discipline IN ('boulder', 'lead', 'speed'));

COMMIT;
