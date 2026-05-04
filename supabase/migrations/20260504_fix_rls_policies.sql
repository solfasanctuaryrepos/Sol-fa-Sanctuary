-- ============================================================================
-- Fix: org_members infinite recursion + promo_codes missing admin policies
-- ============================================================================

-- ── 1. Break org_members RLS infinite recursion ───────────────────────────────
-- The original org_members_select policy contained a self-referential subquery:
--   org_id IN (SELECT org_id FROM org_members m2 WHERE m2.user_id = auth.uid())
-- This causes "infinite recursion detected in policy for relation org_members".
-- Fix: expose a SECURITY DEFINER function that bypasses RLS to get the
-- current user's org IDs, then reference that from the policy instead.

CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM org_members
  WHERE user_id = auth.uid() AND status = 'active'
$$;

-- Drop and recreate the policy without self-reference
DROP POLICY IF EXISTS "org_members_select" ON org_members;

CREATE POLICY "org_members_select" ON org_members FOR SELECT USING (
  user_id = auth.uid()
  OR LOWER(email) = LOWER(auth.email())
  OR org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  OR org_id IN (SELECT auth_user_org_ids())
);

-- ── 2. promo_codes: add admin write policies ──────────────────────────────────
-- Existing policy only allows authenticated SELECT of active codes.
-- Admins need INSERT (create), UPDATE (deactivate), and SELECT all codes.

-- Allow admins to see ALL codes (active and inactive)
DROP POLICY IF EXISTS "Authenticated read promo codes" ON promo_codes;

CREATE POLICY "promo_codes_select" ON promo_codes FOR SELECT USING (
  (is_active = true AND auth.role() = 'authenticated')
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "promo_codes_insert" ON promo_codes FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "promo_codes_update" ON promo_codes FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "promo_codes_delete" ON promo_codes FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
