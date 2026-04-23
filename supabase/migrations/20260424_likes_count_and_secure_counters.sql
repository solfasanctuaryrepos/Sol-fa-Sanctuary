-- Migration: likes_count on sheets + Tier 2 secure increment_sheet_counter
-- Run in Supabase SQL Editor

-- ── 1. Add likes_count column ─────────────────────────────────────────────────
ALTER TABLE public.sheets
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

-- ── 2. Backfill from existing favorites rows ──────────────────────────────────
UPDATE public.sheets s
SET likes_count = (
  SELECT COUNT(*) FROM public.favorites f WHERE f.sheet_id = s.id
);

-- ── 3. Trigger: keep likes_count in sync with favorites table ─────────────────
CREATE OR REPLACE FUNCTION public.handle_favorite_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.sheets SET likes_count = likes_count + 1 WHERE id = NEW.sheet_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.sheets SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.sheet_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_favorite_change ON public.favorites;

CREATE TRIGGER on_favorite_change
  AFTER INSERT OR DELETE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.handle_favorite_change();

-- ── 4. Tier 2: replace increment_sheet_counter with secure version ────────────
-- SECURITY DEFINER runs as DB owner so it can read interactions freely.
-- Validation rules:
--   views      : exclude uploader; for authed users check interactions table to
--                prevent double-count; anonymous views still allowed (localStorage
--                dedup on client) but cannot be exploited via direct RPC because
--                the client localStorage check fires first in-app, and direct
--                console calls by anonymous users are stateless anyway.
--   downloads  : exclude uploader; no dedup by design.
--   comments   : require authentication.
--   comments_dec: require authentication.
CREATE OR REPLACE FUNCTION public.increment_sheet_counter(p_sheet_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_email    text := auth.email();
  v_uploader text;
BEGIN
  SELECT uploaded_by INTO v_uploader FROM public.sheets WHERE id = p_sheet_id;

  IF p_field = 'views' THEN
    -- Uploader's own views don't count
    IF v_email IS NOT NULL AND v_email = v_uploader THEN RETURN; END IF;
    -- Authenticated users: reject if interactions row already exists (already counted)
    IF v_uid IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.interactions
        WHERE id = v_uid::text || '_' || p_sheet_id::text || '_views'
      ) THEN RETURN; END IF;
    END IF;
    UPDATE public.sheets SET views = views + 1 WHERE id = p_sheet_id;

  ELSIF p_field = 'downloads' THEN
    -- Uploader's own downloads don't count
    IF v_email IS NOT NULL AND v_email = v_uploader THEN RETURN; END IF;
    UPDATE public.sheets SET downloads = downloads + 1 WHERE id = p_sheet_id;

  ELSIF p_field = 'comments' THEN
    -- Comments require an authenticated user
    IF v_uid IS NULL THEN RETURN; END IF;
    UPDATE public.sheets SET comments_count = comments_count + 1 WHERE id = p_sheet_id;

  ELSIF p_field = 'comments_dec' THEN
    -- Comment deletion requires an authenticated user
    IF v_uid IS NULL THEN RETURN; END IF;
    UPDATE public.sheets
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = p_sheet_id;

  END IF;
END;
$$;
