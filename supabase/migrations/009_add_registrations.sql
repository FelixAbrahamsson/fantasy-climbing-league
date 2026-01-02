-- Add event_registrations table to store IFSC event registrations
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id integer REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  climber_id integer REFERENCES public.climbers(id) ON DELETE CASCADE NOT NULL,
  registered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(event_id, climber_id)
);

-- Enable RLS
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- Everyone can read registrations
CREATE POLICY "Registrations are viewable by everyone"
ON event_registrations FOR SELECT
USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_climber ON event_registrations(climber_id);
