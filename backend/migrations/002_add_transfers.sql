-- Migration: Add team transfers feature
-- Run this SQL in Supabase SQL Editor

-- Add transfers_per_event column to leagues
ALTER TABLE public.leagues 
ADD COLUMN IF NOT EXISTS transfers_per_event integer DEFAULT 1 
CHECK (transfers_per_event >= 0 AND transfers_per_event <= 6);

-- Create team_transfers table
CREATE TABLE IF NOT EXISTS public.team_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid REFERENCES public.fantasy_teams(id) ON DELETE CASCADE NOT NULL,
  after_event_id integer REFERENCES public.events(id) NOT NULL,
  climber_out_id integer REFERENCES public.climbers(id) NOT NULL,
  climber_in_id integer REFERENCES public.climbers(id) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  reverted_at timestamp with time zone, -- null = active transfer
  UNIQUE(team_id, after_event_id, climber_out_id)
);

-- Enable RLS
ALTER TABLE public.team_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_transfers
CREATE POLICY "Users can view transfers for their teams" ON public.team_transfers
  FOR SELECT USING (
    team_id IN (SELECT id FROM public.fantasy_teams WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert transfers for their teams" ON public.team_transfers
  FOR INSERT WITH CHECK (
    team_id IN (SELECT id FROM public.fantasy_teams WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update transfers for their teams" ON public.team_transfers
  FOR UPDATE USING (
    team_id IN (SELECT id FROM public.fantasy_teams WHERE user_id = auth.uid())
  );
