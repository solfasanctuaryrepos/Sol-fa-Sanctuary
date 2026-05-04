-- ============================================================================
-- Ensemble Workspace — Sol-fa Sanctuary
-- Proper team workspace: separate org entity, member invites, shared
-- collections, org billing attached to the owner's profile.
--
-- All client mutations go through SECURITY DEFINER RPC functions —
-- the org_members INSERT/UPDATE policies only allow service_role, which
-- is what SECURITY DEFINER functions execute as.
-- ============================================================================

-- ── 1. organisations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  owner_id         UUID NOT NULL REFERENCES profiles(id),
  plan             TEXT NOT NULL DEFAULT 'ensemble' CHECK (plan IN ('ensemble')),
  plan_expires_at  TIMESTAMPTZ,          -- mirrors owner's plan_expires_at
  max_seats        INTEGER NOT NULL DEFAULT 20,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. org_members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES profiles(id),   -- null until invite accepted
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removed')),
  invited_by   UUID REFERENCES profiles(id),
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at    TIMESTAMPTZ,
  UNIQUE (org_id, email)
);

-- ── 3. org_collections ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. org_collection_sheets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_collection_sheets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  UUID NOT NULL REFERENCES org_collections(id) ON DELETE CASCADE,
  sheet_id       UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  added_by       UUID NOT NULL REFERENCES profiles(id),
  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, sheet_id)
);

-- ── 5. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_members_user_id    ON org_members(user_id)  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_org_members_email      ON org_members(email)    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_members_org_id     ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_collections_org_id ON org_collections(org_id);
CREATE INDEX IF NOT EXISTS idx_ocs_collection_id      ON org_collection_sheets(collection_id);

-- ── 6. Trigger: auto-create owner member row on org INSERT ────────────────────
CREATE OR REPLACE FUNCTION create_org_owner_member()
RETURNS TRIGGER AS $$
DECLARE
  owner_email TEXT;
BEGIN
  SELECT email INTO owner_email FROM profiles WHERE id = NEW.owner_id;
  INSERT INTO org_members (org_id, user_id, email, role, status, joined_at)
  VALUES (NEW.id, NEW.owner_id, owner_email, 'owner', 'active', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_create_org_owner ON organisations;
CREATE TRIGGER auto_create_org_owner
  AFTER INSERT ON organisations
  FOR EACH ROW EXECUTE FUNCTION create_org_owner_member();

-- ── 7. RPC: create_organisation ──────────────────────────────────────────────
-- Creates an organisation owned by the calling user.
-- Copies owner's plan_expires_at so org billing mirrors personal billing.
CREATE OR REPLACE FUNCTION create_organisation(org_name TEXT)
RETURNS UUID AS $$
DECLARE
  new_org_id         UUID;
  owner_plan_expires TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT plan_expires_at INTO owner_plan_expires FROM profiles WHERE id = auth.uid();
  INSERT INTO organisations (name, owner_id, plan, plan_expires_at)
  VALUES (TRIM(org_name), auth.uid(), 'ensemble', owner_plan_expires)
  RETURNING id INTO new_org_id;
  -- Trigger auto-creates the owner org_member row
  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. RPC: invite_org_member ─────────────────────────────────────────────────
-- Caller must be owner or admin of the org. Validates seat limit.
-- Upserts so a previously-removed email can be re-invited.
CREATE OR REPLACE FUNCTION invite_org_member(
  org_id_param  UUID,
  invite_email  TEXT,
  invite_role   TEXT DEFAULT 'member'
) RETURNS void AS $$
DECLARE
  seat_count INTEGER;
  max_s      INTEGER;
BEGIN
  -- Validate caller authority
  IF NOT EXISTS (
    SELECT 1 FROM organisations WHERE id = org_id_param AND owner_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = org_id_param AND user_id = auth.uid()
      AND role IN ('owner', 'admin') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorised to invite members';
  END IF;

  -- Validate role value
  IF invite_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Invalid role — must be admin or member';
  END IF;

  -- Check seat limit
  SELECT COUNT(*), max_seats INTO seat_count, max_s
  FROM org_members
  JOIN organisations ON organisations.id = org_members.org_id
  WHERE org_members.org_id = org_id_param AND org_members.status != 'removed'
  GROUP BY organisations.max_seats;

  IF seat_count >= COALESCE(max_s, 20) THEN
    RAISE EXCEPTION 'Organisation has reached its maximum seat limit (% seats)', max_s;
  END IF;

  -- Upsert (re-invite if previously removed)
  INSERT INTO org_members (org_id, email, role, status, invited_by, invited_at)
  VALUES (org_id_param, LOWER(TRIM(invite_email)), invite_role, 'pending', auth.uid(), NOW())
  ON CONFLICT (org_id, email) DO UPDATE
    SET status     = 'pending',
        invited_by = auth.uid(),
        invited_at = NOW(),
        role       = invite_role
    WHERE org_members.status = 'removed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. RPC: accept_org_invite ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_org_invite(invite_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE org_members
  SET user_id   = auth.uid(),
      status    = 'active',
      joined_at = NOW()
  WHERE id = invite_id
    AND LOWER(email) = LOWER(auth.email())
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found, already accepted, or does not match your email';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. RPC: decline_org_invite ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decline_org_invite(invite_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE org_members
  SET status = 'removed'
  WHERE id = invite_id
    AND LOWER(email) = LOWER(auth.email())
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already handled';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 11. RPC: remove_org_member ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION remove_org_member(member_id UUID)
RETURNS void AS $$
DECLARE
  target org_members%ROWTYPE;
  org    organisations%ROWTYPE;
BEGIN
  SELECT * INTO target FROM org_members WHERE id = member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  SELECT * INTO org FROM organisations WHERE id = target.org_id;

  -- Owner cannot be removed
  IF org.owner_id = target.user_id THEN
    RAISE EXCEPTION 'The organisation owner cannot be removed';
  END IF;

  -- Must be org owner, org admin, or self-removal
  IF NOT (
    org.owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = target.org_id AND user_id = auth.uid()
        AND role IN ('owner', 'admin') AND status = 'active'
    )
    OR target.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised to remove this member';
  END IF;

  UPDATE org_members SET status = 'removed' WHERE id = member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 12. RLS ───────────────────────────────────────────────────────────────────

-- organisations --
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "orgs_select" ON organisations FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = organisations.id AND user_id = auth.uid() AND status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "orgs_insert" ON organisations FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "orgs_update" ON organisations FOR UPDATE
    USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- org_members: reads are open to members; writes only via SECURITY DEFINER RPCs --
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org_members_select" ON org_members FOR SELECT USING (
    user_id = auth.uid()
    OR LOWER(email) = LOWER(auth.email())
    OR org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR org_id IN (
      SELECT org_id FROM org_members m2
      WHERE m2.user_id = auth.uid() AND m2.status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only RPC functions (SECURITY DEFINER → service_role internally) can write
DO $$ BEGIN
  CREATE POLICY "org_members_write" ON org_members
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- org_collections --
ALTER TABLE org_collections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org_cols_select" ON org_collections FOR SELECT USING (
    org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "org_cols_insert" ON org_collections FOR INSERT WITH CHECK (
    org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "org_cols_delete" ON org_collections FOR DELETE USING (
    created_by = auth.uid()
    OR org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- org_collection_sheets --
ALTER TABLE org_collection_sheets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ocs_select" ON org_collection_sheets FOR SELECT USING (
    collection_id IN (
      SELECT oc.id FROM org_collections oc
      WHERE oc.org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
         OR oc.org_id IN (
           SELECT org_id FROM org_members
           WHERE user_id = auth.uid() AND status = 'active'
         )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ocs_insert" ON org_collection_sheets FOR INSERT WITH CHECK (
    collection_id IN (
      SELECT oc.id FROM org_collections oc
      WHERE oc.org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
         OR oc.org_id IN (
           SELECT org_id FROM org_members
           WHERE user_id = auth.uid() AND status = 'active'
         )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ocs_delete" ON org_collection_sheets FOR DELETE USING (
    added_by = auth.uid()
    OR collection_id IN (
      SELECT oc.id FROM org_collections oc
      WHERE oc.org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
