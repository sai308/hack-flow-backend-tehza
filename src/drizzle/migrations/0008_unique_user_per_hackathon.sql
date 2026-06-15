-- Migration: 0008_unique_user_per_hackathon
-- Prevents a user from appearing in two teams of the same hackathon.
-- Because hackathon_id lives on the teams table (not team_members),
-- a simple UNIQUE constraint is not possible — we use a trigger instead.

CREATE OR REPLACE FUNCTION check_one_team_per_hackathon()
RETURNS TRIGGER AS $$
DECLARE
  v_hackathon_id UUID;
  v_count        INT;
BEGIN
  -- Resolve the hackathon of the team being joined
  SELECT hackathon_id INTO v_hackathon_id
  FROM teams
  WHERE id = NEW.team_id
    AND deleted_at IS NULL;

  -- Nothing to check if the team is already soft-deleted or not found
  IF v_hackathon_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing memberships for this user in the same hackathon
  -- (excluding the current team to allow updates/captain transfers)
  SELECT COUNT(*) INTO v_count
  FROM team_members tm
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.user_id      = NEW.user_id
    AND t.hackathon_id  = v_hackathon_id
    AND t.deleted_at    IS NULL
    AND tm.team_id      != NEW.team_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'User is already a member of a team in this hackathon'
      USING ERRCODE = '23505';  -- unique_violation — maps to ConflictError
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop first so re-running the migration is idempotent
DROP TRIGGER IF EXISTS trg_one_team_per_hackathon ON team_members;

CREATE TRIGGER trg_one_team_per_hackathon
BEFORE INSERT ON team_members
FOR EACH ROW EXECUTE FUNCTION check_one_team_per_hackathon();
