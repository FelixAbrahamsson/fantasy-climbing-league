-- Remove transfer revert functionality
-- Transfers are now permanent once made

-- Drop the reverted_at column from team_transfers
ALTER TABLE team_transfers DROP COLUMN IF EXISTS reverted_at;
