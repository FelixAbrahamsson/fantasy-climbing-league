-- RLS Policies for Fantasy Climbing League
-- Run this in your Supabase SQL Editor to enable frontend access

-- ============================================================================
-- League Members - Allow users to read their own memberships
-- ============================================================================
CREATE POLICY "Users can view their own memberships"
ON league_members FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can view memberships in leagues they belong to"
ON league_members FOR SELECT
USING (
  league_id IN (
    SELECT league_id FROM league_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "League admins can manage members"
ON league_members FOR ALL
USING (
  league_id IN (
    SELECT id FROM leagues WHERE admin_id = auth.uid()
  )
);

CREATE POLICY "Users can join leagues"
ON league_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Fantasy Teams - Allow users to read/manage their own teams
-- ============================================================================
CREATE POLICY "Users can view teams in their leagues"
ON fantasy_teams FOR SELECT
USING (
  league_id IN (
    SELECT league_id FROM league_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create teams in leagues they belong to"
ON fantasy_teams FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  league_id IN (
    SELECT league_id FROM league_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own teams"
ON fantasy_teams FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own teams"
ON fantasy_teams FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- Team Roster - Allow users to manage their team rosters
-- ============================================================================
CREATE POLICY "Users can view rosters in their leagues"
ON team_roster FOR SELECT
USING (
  team_id IN (
    SELECT id FROM fantasy_teams
    WHERE league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage their own team rosters"
ON team_roster FOR ALL
USING (
  team_id IN (
    SELECT id FROM fantasy_teams WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- Team Transfers - Allow users to manage their transfers
-- ============================================================================
CREATE POLICY "Users can view transfers in their leagues"
ON team_transfers FOR SELECT
USING (
  team_id IN (
    SELECT id FROM fantasy_teams
    WHERE league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage their own transfers"
ON team_transfers FOR ALL
USING (
  team_id IN (
    SELECT id FROM fantasy_teams WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- League Events - Allow reading league events
-- ============================================================================
CREATE POLICY "League events are viewable by league members"
ON league_events FOR SELECT
USING (
  league_id IN (
    SELECT league_id FROM league_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "League admins can manage league events"
ON league_events FOR ALL
USING (
  league_id IN (
    SELECT id FROM leagues WHERE admin_id = auth.uid()
  )
);

-- ============================================================================
-- Public Tables - Allow reading reference data
-- ============================================================================

-- Climbers are public reference data
CREATE POLICY "Climbers are viewable by everyone"
ON climbers FOR SELECT
USING (true);

-- Events are public reference data  
CREATE POLICY "Events are viewable by everyone"
ON events FOR SELECT
USING (true);

-- Event Results are public reference data (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'event_results') THEN
    EXECUTE 'CREATE POLICY "Event results are viewable by everyone" ON event_results FOR SELECT USING (true)';
  END IF;
END $$;

-- Captain History
CREATE POLICY "Users can view captain history in their leagues"
ON captain_history FOR SELECT
USING (
  team_id IN (
    SELECT id FROM fantasy_teams
    WHERE league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage their captain history"
ON captain_history FOR ALL
USING (
  team_id IN (
    SELECT id FROM fantasy_teams WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- Leagues - Update policies
-- ============================================================================
CREATE POLICY "League admins can update their leagues"
ON leagues FOR UPDATE
USING (auth.uid() = admin_id);

CREATE POLICY "League admins can delete their leagues"
ON leagues FOR DELETE
USING (auth.uid() = admin_id);
