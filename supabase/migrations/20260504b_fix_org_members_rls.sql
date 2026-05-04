-- ============================================================================
-- Fix: remove self-referential condition from org_members RLS policy.
-- PostgreSQL's recursion detector fires conservatively when a policy's USING
-- expression calls a function that queries the same table, even if the
-- function runs as a BYPASSRLS role.
--
-- Solution:
--   1. Simplify the policy to three non-recursive conditions.
--   2. Expose a SECURITY DEFINER RPC (list_org_members) for the UI to
--      fetch the full member list — runs as supabase_admin, bypasses RLS.
-- ============================================================================

-- Drop the recursive policy and helper function
DROP POLICY   IF EXISTS "org_members_select" ON org_members;
DROP FUNCTION IF EXISTS auth_user_org_ids();

-- Non-recursive policy: covers the three cases that need no self-join
CREATE POLICY "org_members_select" ON org_members FOR SELECT USING (
  -- 1. User sees their own active/pending/removed row
  user_id = auth.uid()
  -- 2. User sees pending invites addressed to their email
  OR LOWER(email) = LOWER(auth.email())
  -- 3. Org owner sees all member rows (uses organisations, not org_members)
  OR org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);

-- ── RPC: list_org_members ─────────────────────────────────────────────────────
-- Lets any active org member (not just the owner) fetch the full member list.
-- Runs as supabase_admin (BYPASSRLS) so it reads org_members without RLS.
-- Access check uses organisations (owner) then a direct superuser read (member).
CREATE OR REPLACE FUNCTION list_org_members(org_id_param UUID)
RETURNS TABLE (
  id          UUID,
  org_id      UUID,
  user_id     UUID,
  email       TEXT,
  role        TEXT,
  status      TEXT,
  invited_by  UUID,
  invited_at  TIMESTAMPTZ,
  joined_at   TIMESTAMPTZ,
  display_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Caller must be the org owner OR an active member (direct read, no RLS here)
  IF NOT EXISTS (
    SELECT 1 FROM organisations WHERE id = org_id_param AND owner_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = org_id_param AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized to list members of this organisation';
  END IF;

  RETURN QUERY
    SELECT
      om.id, om.org_id, om.user_id, om.email, om.role, om.status,
      om.invited_by, om.invited_at, om.joined_at,
      p.display_name
    FROM org_members om
    LEFT JOIN profiles p ON p.id = om.user_id
    WHERE om.org_id = org_id_param
      AND om.status != 'removed'
    ORDER BY
      CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      om.joined_at ASC NULLS LAST;
END;
$$;
