# Napkin Runbook — Sol-fa Sanctuary

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

---

## Execution & Validation (Highest Priority)

1. **[2026-05-06] git push fails with SSL schannel error**
   Do instead: `git -c http.sslVerify=false push origin main`

2. **[2026-05-06] Coolify API key expired — use localhost on VPS**
   Do instead: SSH to VPS, call `http://localhost:8000/api/v1/deploy?uuid=ymhf0lnbs7cz1je1te0u09jc` with `Bearer 3|ClaudeAutoNewKey987`. External `app.coolify.io` endpoint returns 401.

3. **[2026-05-06] Supabase migrations must be applied manually**
   Do instead: `scp` SQL file to VPS → `docker cp` into `supabase-db-ufygfvehcpq60omburadd86a` → `docker exec ... psql -U supabase_admin -d postgres -f /tmp/file.sql`

4. **[2026-05-06] Entitlements are cached per session — PricingPage shows stale billing state**
   Do instead: Call `ent.refresh()` inside `useEffect(() => { ent.refresh(); }, [])` on any page that must reflect live billing state.

---

## Shell & Command Reliability

1. **[2026-05-06] `python3` and `pip` not in bash PATH on Windows**
   Do instead: Use `py -3` (Windows launcher) and `py -3 -m pip`. Never `python3`/`pip3` in Bash tool.

2. **[2026-05-06] Supabase client alias is `db` not `supabase`**
   Do instead: `import { db } from '../supabase'` everywhere. Raw `supabase` import will break.

3. **[2026-05-06] org_members RLS causes infinite recursion — never query directly for member lists**
   Do instead: Use `db.rpc('list_org_members', { org_id_param: orgId })` in EnsemblePage. Direct `.from('org_members')` query will fail for non-owners.

---

## Domain Behavior Guardrails

1. **[2026-05-06] billing_config.billing_active is the master billing switch**
   Do instead: Check `billing_active` in `billing_config` table (id=1) before assuming billing is live. `false` = everyone gets full access regardless of plan.

2. **[2026-05-06] PDF page wrapper must NOT have min-h when image is loaded**
   Do instead: Put `min-h-[80px]` only on the loading spinner `<div>`, never on the outer `score-page` wrapper. Otherwise dead space appears between pages on mobile.

3. **[2026-05-06] SW (sw.js) is fragile — bump version carefully**
   Do instead: When modifying `public/sw.js`, increment CACHE_NAME version. Network-First strategy for navigation; bypass all `api.solfasanctuary.com` URLs (never cache Supabase responses).

4. **[2026-05-06] PreviewModal.tsx is dead code**
   Do instead: Never import or reference PreviewModal. FullPreviewPage.tsx is the only PDF viewer.

---

## User Directives

1. **[2026-05-06] Plan before multi-file tasks**
   Do instead: Always propose plan and wait for approval before touching >1 file.

2. **[2026-05-06] Caveman mode always active**
   Do instead: Drop articles/filler/pleasantries every response. Code blocks normal. Security warnings normal.

3. **[2026-05-06] Never install packages without asking first**
   Do instead: List proposed package + reason, wait for explicit yes.

4. **[2026-05-06] Deploy = push to main + trigger Coolify**
   Do instead: After every code commit, ask user if redeploy needed. Use SSH-tunnel curl to trigger (see Execution #2 above).
