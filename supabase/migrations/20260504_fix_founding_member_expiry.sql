-- ============================================================================
-- Fix founding member plan_expires_at
-- Founding membership is permanent — plan_expires_at should always be NULL.
-- This nulls out any stale 365-day expiry set by the old code.
-- Safe to run multiple times (idempotent).
-- ============================================================================

UPDATE profiles
SET plan_expires_at = NULL
WHERE is_founding_member = true
  AND plan_expires_at IS NOT NULL;

-- Fix the auto_assign_founding_member trigger function so future uploads
-- also produce a NULL expiry (belt-and-suspenders alongside the migration fix).
CREATE OR REPLACE FUNCTION auto_assign_founding_member()
RETURNS TRIGGER AS $$
DECLARE
  founding_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO founding_count FROM profiles WHERE is_founding_member = true;
  IF founding_count < 20 THEN
    UPDATE profiles
    SET is_founding_member = true,
        plan               = 'founding',
        plan_expires_at    = NULL   -- founding membership never expires
    WHERE id = NEW.uploaded_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
