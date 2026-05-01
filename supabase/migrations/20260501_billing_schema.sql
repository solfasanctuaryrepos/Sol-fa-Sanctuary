-- ============================================================================
-- Billing Schema — Sol-fa Sanctuary
-- Run each numbered block in order in the Supabase SQL editor.
-- All blocks are idempotent (safe to re-run).
-- ============================================================================

-- ── 1. Billing columns on profiles ──────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','maestro_monthly','maestro_yearly','ensemble','founding')),
  ADD COLUMN IF NOT EXISTS plan_expires_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pricing_region           TEXT NOT NULL DEFAULT 'international'
    CHECK (pricing_region IN ('local','international')),
  ADD COLUMN IF NOT EXISTS currency                 TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('XAF','USD')),
  ADD COLUMN IF NOT EXISTS moneroo_payment_id       TEXT,
  ADD COLUMN IF NOT EXISTS is_founding_member       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_promo_code      TEXT;

-- ── 2. sheet_engagement table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sheet_engagement (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id         UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  total_downloads  INTEGER NOT NULL DEFAULT 0,
  total_saves      INTEGER NOT NULL DEFAULT 0,
  total_views      INTEGER NOT NULL DEFAULT 0,
  total_shares     INTEGER NOT NULL DEFAULT 0,
  average_rating   DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count     INTEGER NOT NULL DEFAULT 0,
  quality_score    INTEGER NOT NULL DEFAULT 0,
  is_quality_sheet BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sheet_engagement_sheet_id_idx
  ON sheet_engagement(sheet_id);

-- Backfill from existing sheets table data
-- NOTE: change "likesCount" to "likes_count" if your column uses snake_case
INSERT INTO sheet_engagement (
  sheet_id, total_downloads, total_views, quality_score, is_quality_sheet, updated_at
)
SELECT
  s.id,
  COALESCE(s.downloads, 0),
  COALESCE(s.views, 0),
  LEAST(100, ROUND(
      LEAST(COALESCE(s.downloads,0)::DECIMAL / 200 * 100, 100) * 0.30
    + CASE WHEN COALESCE(s.views,0) > 0
           THEN LEAST(COALESCE(s.downloads,0)::DECIMAL / s.views * 100 * 2, 100)
           ELSE 0 END * 0.20
    + LEAST(COALESCE(s."likesCount",0)::DECIMAL / 20 * 100, 100) * 0.15
  )),
  LEAST(100, ROUND(
      LEAST(COALESCE(s.downloads,0)::DECIMAL / 200 * 100, 100) * 0.30
    + CASE WHEN COALESCE(s.views,0) > 0
           THEN LEAST(COALESCE(s.downloads,0)::DECIMAL / s.views * 100 * 2, 100)
           ELSE 0 END * 0.20
    + LEAST(COALESCE(s."likesCount",0)::DECIMAL / 20 * 100, 100) * 0.15
  )) >= 65,
  NOW()
FROM sheets s
ON CONFLICT (sheet_id) DO UPDATE SET
  total_downloads  = EXCLUDED.total_downloads,
  total_views      = EXCLUDED.total_views,
  quality_score    = EXCLUDED.quality_score,
  is_quality_sheet = EXCLUDED.is_quality_sheet,
  updated_at       = NOW();

-- ── 3. billing_config table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_config (
  id                         INTEGER PRIMARY KEY DEFAULT 1,
  quality_sheet_threshold    INTEGER     NOT NULL DEFAULT 300,
  date_threshold             TIMESTAMPTZ,
  billing_active             BOOLEAN     NOT NULL DEFAULT false,
  billing_activated_at       TIMESTAMPTZ,
  founding_window_closes_at  TIMESTAMPTZ
);

INSERT INTO billing_config (id, quality_sheet_threshold)
VALUES (1, 300)
ON CONFLICT (id) DO NOTHING;

-- ── 4. promo_codes table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT      NOT NULL UNIQUE,
  type          TEXT      NOT NULL CHECK (type IN ('founding')),
  max_uses      INTEGER   NOT NULL DEFAULT 1,
  current_uses  INTEGER   NOT NULL DEFAULT 0,
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE sheet_engagement ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "sheet_engagement_public_read" ON sheet_engagement FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "sheet_engagement_service_write" ON sheet_engagement FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE billing_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "billing_config_public_read" ON billing_config FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "billing_config_service_write" ON billing_config FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "promo_codes_service_only" ON promo_codes FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Auto-founding member trigger ──────────────────────────────────────────
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
        plan_expires_at    = NOW() + INTERVAL '365 days'
    WHERE id = NEW.uploaded_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS assign_founding_on_upload ON sheets;
CREATE TRIGGER assign_founding_on_upload
  AFTER INSERT ON sheets
  FOR EACH ROW EXECUTE FUNCTION auto_assign_founding_member();

-- ── 7. pg_cron billing activation check ──────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION check_and_activate_billing()
RETURNS void AS $$
DECLARE
  cfg           billing_config%ROWTYPE;
  quality_count INTEGER;
BEGIN
  SELECT * INTO cfg FROM billing_config WHERE id = 1;
  IF cfg IS NULL OR cfg.billing_active THEN RETURN; END IF;
  SELECT COUNT(*) INTO quality_count FROM sheet_engagement WHERE is_quality_sheet = true;
  IF quality_count >= cfg.quality_sheet_threshold
    OR (cfg.date_threshold IS NOT NULL AND NOW() >= cfg.date_threshold)
  THEN
    UPDATE billing_config
    SET billing_active = true, billing_activated_at = NOW()
    WHERE id = 1;
    RAISE LOG 'Billing activated: % quality sheets, threshold %, date threshold %',
      quality_count, cfg.quality_sheet_threshold, cfg.date_threshold;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule(
  'billing-activation-check',
  '0 * * * *',
  'SELECT check_and_activate_billing()'
);

-- ── POST GO-LIVE: run this when you go live ──────────────────────────────────
-- UPDATE billing_config SET
--   date_threshold            = NOW() + INTERVAL '90 days',
--   founding_window_closes_at = NOW() + INTERVAL '30 days'
-- WHERE id = 1;
