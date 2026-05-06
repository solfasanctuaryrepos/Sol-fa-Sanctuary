# Sol-fa Sanctuary — Claude Context

> Auto-loaded every session. Source of truth. Update when things change.
> Companion: `.claude/napkin.md` — living runbook, updated by napkin skill each session.

---

## What This Is

Sol-fa Sanctuary — music sheet SaaS for choral/ensemble musicians (target: Cameroon + global).
Owner: Vitalis Nkwenti (`vitalisnkwenti@gmail.com`). Admin account: `solfasanctuary@gmail.com`.
Business model: Freemium (Free / Maestro / Ensemble / Founding Member).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 5, Vite 6 |
| Styling | Tailwind CSS 4 (bundled via @tailwindcss/vite, NOT CDN) |
| Icons | Lucide React |
| Backend | Supabase JS v2 (self-hosted) |
| PWA | `public/sw.js` v5.1 (Network-First nav, bypass Supabase URLs) |
| Build | `npm run build` → `dist/` |
| Serve | nginx in Docker (Dockerfile in root) |
| Deploy | Coolify on self-hosted VPS |

**No other dependencies.** Do NOT add packages without user approval.

---

## Infrastructure

| Resource | Value |
|---|---|
| Supabase project ID | `ewyxpmtbgvbumkltwxvp` |
| Supabase URL | `https://api.solfasanctuary.com` |
| App URL | `https://solfasanctuary.com` |
| VPS IP | `76.13.138.43` |
| SSH key | `~/.ssh/vps_solfasanctuary` |
| GitHub repo | `solfasanctuaryrepos/Sol-fa-Sanctuary` |
| Coolify app UUID | `ymhf0lnbs7cz1je1te0u09jc` |
| Coolify API (localhost on VPS) | `http://localhost:8000/api/v1/` |
| Coolify API token | `3|ClaudeAutoNewKey987` (created 2026-05-06, token id=3 in coolify-db) |
| git push SSL workaround | `git -c http.sslVerify=false push origin main` |

**Coolify deploy trigger:**
```bash
ssh -i ~/.ssh/vps_solfasanctuary root@76.13.138.43 \
  "curl -s 'http://localhost:8000/api/v1/deploy?uuid=ymhf0lnbs7cz1je1te0u09jc&force=false' \
  -H 'Authorization: Bearer 3|ClaudeAutoNewKey987'"
```

---

## Key File Map

```
App.tsx                         — root: auth state, routing, all page mounts
supabase.ts                     — Supabase client (alias: db)
types.ts                        — ALL shared types (import from here, never duplicate)
constants.ts                    — app-wide constants
index.css                       — root styles (Tailwind entry)
hooks/useEntitlements.ts        — billing/plan logic, feature flags
hooks/useInstallPrompt.ts       — PWA install prompt
hooks/useOfflineSheets.ts       — offline save/restore
contexts/EntitlementsContext.tsx — wraps app; exposes ent.refresh()
contexts/ThemeContext.tsx        — dark/light mode

components/
  LandingPage.tsx     — public home
  AuthModal.tsx       — sign-in / sign-up / Google OAuth
  Navbar.tsx          — top nav, dark mode toggle
  Dashboard.tsx       — user's uploaded sheets
  MusicLibrary.tsx    — public sheet browser
  FullPreviewPage.tsx — PDF viewer (lazy LazyPdfPage, flow/single view mode)
  AdminDashboard.tsx  — admin: users tab + content tab
  BillingAdminPage.tsx— admin: billing overview
  PricingPage.tsx     — plan cards; calls ent.refresh() on mount
  EnsemblePage.tsx    — org/team workspace; uses list_org_members RPC
  CollectionsPage.tsx — user collections
  ProfilePage.tsx     — user profile
  UploadModal.tsx     — sheet upload (PDF + thumbnail to Supabase Storage)
  RequestModal.tsx    — sheet request creation
  RequestCard.tsx     — request card with comments
  RequestComments.tsx — comments on requests
  HelpPage.tsx        — help/FAQ
  AboutPage.tsx       — about page (GitHub/LinkedIn links still TODO)
  PreviewModal.tsx    — DEAD CODE — superseded by FullPreviewPage, delete when ready

supabase/migrations/            — all DB migrations (apply via psql on VPS)
public/sw.js                    — Service Worker v5.1 (do not touch casually)
public/manifest.json            — PWA manifest
```

---

## Database Schema (key tables)

| Table | Purpose |
|---|---|
| `profiles` | One per auth user. Cols: `plan`, `plan_expires_at`, `is_founding_member`, `pricing_region`, `currency`, `display_name` |
| `sheets` | Music sheets. Cols: `id`, `title`, `composer`, `pdf_url`, `thumbnail_url`, `views`, `downloads`, `likesCount` |
| `sheet_engagement` | Aggregate stats per sheet (quality_score, ratings) |
| `interactions` | Per-user view/download events (analytics, not yet surfaced in UI) |
| `billing_config` | Single row `id=1`. Col: `billing_active BOOLEAN` — master switch |
| `promo_codes` | Founding member promo codes |
| `organisations` | Ensemble orgs. Cols: `plan`, `plan_expires_at`, `owner_id` |
| `org_members` | Org membership. Cols: `org_id`, `user_id`, `role`, `status` |
| `sheet_requests` | Community sheet requests with votes |
| `favorites` | User favorites (sheet_id + user_id) |

**RLS notes:**
- `org_members` had infinite-recursion RLS bug → fixed via `list_org_members(org_id_param UUID)` SECURITY DEFINER RPC
- `EnsemblePage.tsx` uses `db.rpc('list_org_members', { org_id_param })` NOT direct `org_members` query
- Auth helper `auth_user_org_ids()` was DROPPED (PostgreSQL recursion guard fires even on BYPASSRLS)
- `promo_codes` — admin write policies: INSERT/UPDATE/DELETE/SELECT with `is_admin()` check

---

## Billing System

**Master switch:** `billing_config` table, `id=1`, col `billing_active`.
- `false` → everyone gets full access (pre-launch mode)
- `true` → enforce plan limits

**Plans:** `free` | `maestro_monthly` | `maestro_yearly` | `ensemble` | `founding`

**Entitlements flow:**
1. `useEntitlements(userId)` in `hooks/useEntitlements.ts` — fetches `profiles` + `billing_config` + `org_members`
2. Wrapped in `EntitlementsContext` → `useEntitlementsContext()` in any component
3. `ent.refresh()` — call after payment or on PricingPage mount (stale cache fix)
4. `PricingPage.tsx` calls `useEffect(() => { ent.refresh(); }, [])` on mount

**Payment:** Moneroo (local Cameroon payments). `moneroo_payment_id` stored on profile.

**Pricing regions:** `local` (XAF) | `international` (USD). Detected by IP / user selection.

---

## Architecture Patterns

- **No prop drilling >2 levels** — use context or state lifting
- **Functional components only** — no class components
- **Types in `types.ts`** — never duplicate type definitions
- **Supabase client alias:** `import { db } from '../supabase'` (NOT `supabase`)
- **Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (must have `VITE_` prefix)
- **Dark mode:** `darkMode` boolean prop drilled from App; `ThemeContext` for toggle
- **PDF lazy loading:** `LazyPdfPage` component with IntersectionObserver; no `min-h` on wrapper when image loaded
- **View modes:** `FullPreviewPage` has `flow` (scroll all pages) and `single` (one page + swipe/arrows) — persisted in `localStorage('sheetViewMode')`

---

## Deployment Workflow

```
1. Edit code
2. git add <files> && git commit -m "message"
3. git -c http.sslVerify=false push origin main
4. Coolify auto-deploys on push (webhook) OR trigger manually (see curl above)
5. Build: npm run build inside Docker → dist/ served by nginx
```

Migrations: copy `.sql` to VPS via `scp`, then run via `docker exec supabase-db-... psql`.

---

## Pending Tasks (as of 2026-05-06)

### Billing testing → go live
- [x] `billing_active = true` set in DB
- [x] PricingPage refresh fix deployed
- [ ] Test all billing flows (upgrade, Maestro, Ensemble, Founding promo)
- [ ] Flip `billing_active = false` after testing (until official launch)
- [ ] Pre-launch cleanup: delete all test users, sheets, orgs from DB

### Roadmap items
- [ ] `PreviewModal.tsx` — delete (dead code, superseded by FullPreviewPage)
- [ ] Share button — implement Web Share API with clipboard fallback (`?sheet=<id>`)
- [ ] Print button — `window.print()` + `@media print` CSS
- [ ] AboutPage GitHub/LinkedIn links — get real URLs from owner
- [ ] Resend verification email — replace `resetPasswordForEmail` with `supabase.auth.resend({ type: 'signup', email })`
- [ ] Analytics UI — surface `interactions` table in AdminDashboard (top viewed/downloaded)

---

## Code Rules (non-negotiable)

1. Only touch files explicitly in scope
2. Never refactor working code unless task says so
3. Never install packages without user approval
4. Plan before executing multi-file tasks
5. Return only changed files

---

## Session Token Efficiency Tips

- Caveman mode active by default (set in session hook)
- Napkin skill (`/napkin`) maintains `.claude/napkin.md` — check it for recent decisions
- Use `caveman:cavecrew-investigator` to locate code (read-only, ~60% fewer tokens)
- Use `caveman:cavecrew-builder` for 1-2 file edits
- Avoid reading entire large files — use `offset`/`limit` params on Read tool
- `STACK.md`, `SCOPE.md`, `DECISIONS.md` still exist but CLAUDE.md is now source of truth
