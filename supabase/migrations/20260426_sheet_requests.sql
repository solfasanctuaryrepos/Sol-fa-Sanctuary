-- Sheet Requests feature migration
-- Applied live via pg_meta API. Tables, RLS, indexes, and functions created in stages.

-- 1. sheet_requests table (already created in previous session)
-- CREATE TABLE IF NOT EXISTS public.sheet_requests (...)

-- 2. request_votes table
CREATE TABLE IF NOT EXISTS public.request_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.sheet_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(request_id, user_id)
);
ALTER TABLE public.request_votes ENABLE ROW LEVEL SECURITY;

-- 3. request_comments table
CREATE TABLE IF NOT EXISTS public.request_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.sheet_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Anonymous',
  body text NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 2000),
  sheet_id uuid REFERENCES public.sheets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
DO $$ BEGIN CREATE POLICY "Public can view requests" ON public.sheet_requests FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can insert requests" ON public.sheet_requests FOR INSERT WITH CHECK (auth.uid() = requested_by); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owners can update their requests" ON public.sheet_requests FOR UPDATE USING (auth.uid() = requested_by); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owners can delete their requests" ON public.sheet_requests FOR DELETE USING (auth.uid() = requested_by); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "Public can view votes" ON public.request_votes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can vote" ON public.request_votes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can unvote" ON public.request_votes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "Public can view comments" ON public.request_comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can comment" ON public.request_comments FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can edit own comments" ON public.request_comments FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete own comments" ON public.request_comments FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_sheet_requests_status ON public.sheet_requests(status);
CREATE INDEX IF NOT EXISTS idx_sheet_requests_votes ON public.sheet_requests(votes_count DESC);
CREATE INDEX IF NOT EXISTS idx_sheet_requests_requested_by ON public.sheet_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_sheet_requests_created ON public.sheet_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_votes_request ON public.request_votes(request_id);
CREATE INDEX IF NOT EXISTS idx_request_comments_request ON public.request_comments(request_id);
CREATE INDEX IF NOT EXISTS idx_sheet_requests_title_trgm ON public.sheet_requests USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sheets_title_trgm ON public.sheets USING gin(title gin_trgm_ops);

-- 6. RPC: toggle_request_vote
CREATE OR REPLACE FUNCTION public.toggle_request_vote(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_delta int;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'not authenticated'); END IF;
  SELECT id INTO v_existing FROM public.request_votes WHERE request_id = p_request_id AND user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    DELETE FROM public.request_votes WHERE id = v_existing; v_delta := -1;
  ELSE
    INSERT INTO public.request_votes (request_id, user_id) VALUES (p_request_id, v_user_id); v_delta := 1;
  END IF;
  UPDATE public.sheet_requests SET votes_count = votes_count + v_delta WHERE id = p_request_id;
  RETURN jsonb_build_object('voted', v_delta > 0, 'votes_count', (SELECT votes_count FROM public.sheet_requests WHERE id = p_request_id));
END;
$$;

-- 7. RPC: find_similar_sheets (duplicate detection for upload)
CREATE OR REPLACE FUNCTION public.find_similar_sheets(p_title text, p_composer text DEFAULT NULL, p_threshold float DEFAULT 0.3)
RETURNS TABLE(id uuid, title text, composer text, similarity_score float)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.id, s.title, s.composer,
    GREATEST(
      similarity(lower(s.title), lower(p_title)),
      CASE WHEN p_composer IS NOT NULL AND s.composer IS NOT NULL
        THEN similarity(lower(s.composer), lower(p_composer)) * 0.4 ELSE 0 END
    ) AS similarity_score
  FROM public.sheets s
  WHERE similarity(lower(s.title), lower(p_title)) > p_threshold
     OR (p_composer IS NOT NULL AND s.composer IS NOT NULL AND similarity(lower(s.composer), lower(p_composer)) > p_threshold)
  ORDER BY similarity_score DESC
  LIMIT 5;
$$;

-- 8. RPC: find_similar_requests (duplicate detection for request modal)
CREATE OR REPLACE FUNCTION public.find_similar_requests(p_title text, p_composer text DEFAULT NULL, p_threshold float DEFAULT 0.3)
RETURNS TABLE(id uuid, title text, composer text, votes_count int, status text, similarity_score float)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.id, r.title, r.composer, r.votes_count, r.status,
    GREATEST(
      similarity(lower(r.title), lower(p_title)),
      CASE WHEN p_composer IS NOT NULL AND r.composer IS NOT NULL
        THEN similarity(lower(r.composer), lower(p_composer)) * 0.4 ELSE 0 END
    ) AS similarity_score
  FROM public.sheet_requests r
  WHERE (r.status = 'open' OR r.status = 'in_progress')
    AND (similarity(lower(r.title), lower(p_title)) > p_threshold
      OR (p_composer IS NOT NULL AND r.composer IS NOT NULL AND similarity(lower(r.composer), lower(p_composer)) > p_threshold))
  ORDER BY similarity_score DESC
  LIMIT 5;
$$;
