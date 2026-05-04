-- ============================================================================
-- Fix auto_assign_founding_member trigger
--
-- Problems with the original trigger:
--   1. Joined profiles via `id = uploaded_by` but uploaded_by stores email
--      (TEXT), not UUID — so the UPDATE never matched any row.
--   2. Fired on all sheet inserts, including private ones.
--   3. Awarded founding status to whoever uploaded first, not to the top
--      contributors by public sheet count.
--
-- New behaviour:
--   - Only fires when a PUBLIC sheet is inserted (is_public = true).
--   - Recalculates the top-20 uploaders by public sheet count after each insert.
--   - Grants founding status to anyone now in that top-20 who doesn't have it.
--   - Stops assigning once 20 founding members exist via this path
--     (promo codes are uncapped and operate independently).
--   - plan_expires_at is always NULL — founding membership never expires.
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_assign_founding_member()
RETURNS TRIGGER AS $$
DECLARE
  founding_count INTEGER;
BEGIN
  -- Only react to public sheet uploads
  IF NOT COALESCE(NEW.is_public, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO founding_count FROM profiles WHERE is_founding_member = true;
  IF founding_count >= 20 THEN
    RETURN NEW;
  END IF;

  -- Grant founding status to anyone currently in the top-20 by public sheet
  -- count who doesn't already have it. Join via email.
  UPDATE profiles p
  SET is_founding_member = true,
      plan               = 'founding',
      plan_expires_at    = NULL
  WHERE p.email IN (
    SELECT s.uploaded_by
    FROM   sheets s
    WHERE  s.is_public = true
    GROUP  BY s.uploaded_by
    ORDER  BY COUNT(*) DESC
    LIMIT  20
  )
  AND p.is_founding_member = false;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach the trigger (no change needed — same name, same table)
DROP TRIGGER IF EXISTS assign_founding_on_upload ON sheets;
CREATE TRIGGER assign_founding_on_upload
  AFTER INSERT ON sheets
  FOR EACH ROW EXECUTE FUNCTION auto_assign_founding_member();
