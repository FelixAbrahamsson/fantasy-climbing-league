-- Fix recursive RLS policy on league_members
-- Run this in Supabase SQL Editor

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view memberships in leagues they belong to" ON league_members;

-- The "Users can view their own memberships" policy is sufficient
-- Users can see their own membership records, which is all they need
