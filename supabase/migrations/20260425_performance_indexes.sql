-- Migration: Performance indexes for common query patterns
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)

-- ── sheets ────────────────────────────────────────────────────────────────────
-- Library view: public, non-restricted sheets ordered by upload date
CREATE INDEX IF NOT EXISTS idx_sheets_public_library
  ON public.sheets (is_public, is_admin_restricted, uploaded_at DESC)
  WHERE is_public = true AND is_admin_restricted = false;

-- Dashboard: sheets by uploader ordered by date
CREATE INDEX IF NOT EXISTS idx_sheets_uploaded_by_date
  ON public.sheets (uploaded_by, uploaded_at DESC);

-- Full-text search on title and composer (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_sheets_title_trgm
  ON public.sheets USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sheets_composer_trgm
  ON public.sheets USING gin (composer gin_trgm_ops);

-- ── favorites ─────────────────────────────────────────────────────────────────
-- Fetch all favorites for a user (UNIQUE constraint covers user_id+sheet_id)
CREATE INDEX IF NOT EXISTS idx_favorites_user_id
  ON public.favorites (user_id);

-- ── comments ──────────────────────────────────────────────────────────────────
-- Load comments for a sheet in chronological order
CREATE INDEX IF NOT EXISTS idx_comments_sheet_created
  ON public.comments (sheet_id, created_at ASC);

-- ── collections ───────────────────────────────────────────────────────────────
-- Load collections for a user by date
CREATE INDEX IF NOT EXISTS idx_collections_user_created
  ON public.collections (user_id, created_at DESC);

-- ── collection_sheets ─────────────────────────────────────────────────────────
-- Load sheets in a collection ordered by when added
CREATE INDEX IF NOT EXISTS idx_collection_sheets_col_added
  ON public.collection_sheets (collection_id, added_at DESC);

-- ── comment_likes ─────────────────────────────────────────────────────────────
-- Fetch which comments a user has liked
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id
  ON public.comment_likes (user_id);

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Admin user list ordered by email
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);
