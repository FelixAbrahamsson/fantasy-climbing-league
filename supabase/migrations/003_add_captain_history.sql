-- Migration: Add captain history tracking
-- Run this SQL in Supabase SQL Editor

-- Create captain_history table to track captain changes over time
CREATE TABLE IF NOT EXISTS public.captain_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid REFERENCES public.fantasy_teams(id) ON DELETE CASCADE NOT NULL,
  climber_id integer REFERENCES public.climbers(id) NOT NULL,
  set_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  replaced_at timestamp with time zone -- null = current captain
);

-- Index for efficient queries by team and time
CREATE INDEX IF NOT EXISTS idx_captain_history_team_time 
  ON public.captain_history(team_id, set_at);

-- Enable RLS
ALTER TABLE public.captain_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view captain history for their teams" ON public.captain_history
  FOR SELECT USING (
    team_id IN (SELECT id FROM public.fantasy_teams WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert captain history for their teams" ON public.captain_history
  FOR INSERT WITH CHECK (
    team_id IN (SELECT id FROM public.fantasy_teams WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update captain history for their teams" ON public.captain_history
  FOR UPDATE USING (
    team_id IN (SELECT id FROM public.fantasy_teams WHERE user_id = auth.uid())
  );

-- Migrate existing captain data: create initial history entry for each team
INSERT INTO public.captain_history (team_id, climber_id, set_at)
SELECT 
  tr.team_id, 
  tr.climber_id, 
  ft.created_at as set_at
FROM public.team_roster tr
JOIN public.fantasy_teams ft ON ft.id = tr.team_id
WHERE tr.is_captain = true 
  AND tr.removed_at IS NULL
ON CONFLICT DO NOTHING;
