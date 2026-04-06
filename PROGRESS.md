# PROGRESS.md — Sol-Fa Sanctuary

## Session Summary (2026-03-18)
Successfully utilized the connected GitHub MCP server token to create a new remote repository (`Sol-fa-Sanctuary`) and successfully pushed the local application code to it.
Prior to this, successfully migrated the application from Firebase to Supabase. This involved replacing Firebase Auth, Firestore, and Storage with Supabase equivalents, refactoring the entire codebase, and setting up the initial database schema with RLS policies.

### History of Changes

#### Phase 1: Planning & Setup
- [x] Analyzed project structure and dependencies.
- [x] Created `context.md` and `implementation_plan.md`.
- [x] Initialized Supabase project (`drykywjtdcispjbudxwm`).
- [x] Created `supabase.ts` for client initialization.

#### Phase 2: Database Schema
- [x] Created `profiles` table with RLS.
- [x] Created `sheets` table with RLS.
- [x] Implemented `handle_new_user` trigger for profile creation.

#### Phase 3: Authentication Migration
- [x] ~~firebase/auth~~ → `@supabase/supabase-js`.
- [x] Refactored `App.tsx` auth state management.
- [x] Refactored `AuthModal.tsx` for Sign-up, Sign-in, and Google Auth.
- [x] Updated profile management to use Supabase `profiles`.

#### Phase 4: Database & Storage Migration
- [x] ~~firebase/firestore~~ → Supabase Database (PostgreSQL).
- [x] ~~firebase/storage~~ → Supabase Storage (Buckets: `sheets`, `thumbnails`).
- [x] Refactored `App.tsx` data fetching and real-time subscriptions.
- [x] Refactored `UploadModal.tsx` for file uploads and record insertion.
- [x] Refactored `Dashboard.tsx` and `AdminDashboard.tsx` for management actions.

#### Phase 5: Cleanup & Verification
- [x] Uninstalled `firebase` and related packages.
- [x] Removed `.firebaserc`, `firebase.json`, `firestore.rules`, `storage.rules`.
- [x] Refactored `FullPreviewPage.tsx` to use Supabase.
- [x] Cleaned up `index.html` and `LandingPage.tsx`.
- [x] **Project Switch**: Successfully moved from `drykywjtdcispjbudxwm` to `ewyxpmtbgvbumkltwxvp`.
    - [x] Updated `supabase.ts`.
    - [x] Re-applied SQL schema via MCP server.
    - [x] **Fixed Database Permissions (GRANT/RLS) via MCP server**.
    - [x] **Fixed Storage RLS Policies via MCP server**.
- [x] Verified all main flows (Auth, Upload, View, Manage).
- [x] **Bug Fix**: Fixed `snake_case` to `camelCase` data mapping in `App.tsx` which was causing sheets to instantly disappear from the UI after upload.
- [x] **Bug Fix**: Reconstructed Supabase `baseQuery` inside real-time event listeners to prevent silent subscription failures on new uploads.
- [x] **Bug Fix**: Unblocked the `Logout` button by removing the `await` operator on `auth.signOut()`, preventing UI hangs caused by Supabase Web Lock contention in React Strict Mode.
- [x] **Auth Config**: Transferred the hardcoded 'Super Admin' permissions from `vitalisnkwenti@gmail.com` to `solfasanctuary@gmail.com`.

#### Phase 6: Code Repository
- [x] Connected to GitHub via provided token.
- [x] Created the remote repository named `Sol-fa-Sanctuary` under `solfasanctuaryrepos`.
- [x] Initialized remote, renamed master branch to main, and pushed all local files to GitHub.

#### Phase 7: Production Deployment
- [x] Linked the local project to Vercel using the CLI (`npx vercel`).
- [x] Corrected the project name to meet Vercel's naming conventions (`solfasanctuary`).
- [x] Successfully deployed the first production build to Vercel.
- [x] Configured permanent environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel project settings for future automated builds.

#### Phase 8: Production Polish (Fixed Deployment Errors)
- [x] Removed Tailwind CDN and migrated to a bundled Tailwind CSS 4.0 setup.
- [x] Relocated PWA assets (`sw.js`, `manifest.json`) from root to `public/` to fix 404 errors in the build output.
- [x] Fixed missing `index.css` issue by creating a proper root stylesheet handled by Vite.
- [x] Removed Redundant `importmap` and switched to standard bundling for better production compatibility.
- [x] Verified build success and asset delivery to Vercel `dist/`.

#### Phase 9: Critical Bug Fixes (Auth, Data, Cache)
| Status | Category | Problem | Solution |
|---|---|---|---|
| [x] Fixed | Authentication | Modal closes immediately or stays on "Processing" | `onAuthStateChange` race conditions and state not resetting. Fixed by using `getSession` on mount and adding `useEffect` resets in `AuthModal`. |
| [x] Fixed | Data | Music sheets not showing on home page | App-level race condition and Service Worker serving stale `index.html`. Fixed by SW v3 (Network-First) and session hydration fix. |
| [x] Fixed | PWA / Cache | Changes not appearing in browser | Service Worker v1 was Cache-First and stuck. Fixed by bumping to v3 and changing to Network-First. |
| [x] Fixed | PWA / Cache | SW TypeError on POST requests | Restricted fetch caching to `GET` requests to avoid errors with Supabase `POST` queries. |

#### Phase 10: Runtime Bug Fixes (Auth, Data, SW v4)
| Status | Category | Problem | Solution |
|---|---|---|---|
| [x] Fixed | Init | `supabase.ts` crashes when env vars are `undefined` | Added `|| ''` fallback to prevent `createClient(undefined, undefined)` from crashing the entire app. |
| [x] Fixed | Auth | `saveUserProfile` never called after signup | Was dead code. Now invoked after signup with `displayName` field included in the upsert. |
| [x] Fixed | Data | Deep-linked sheets have `undefined` fields | Deep-link fetch was not applying snake_case→camelCase mapping like `fetchSheets`. Added the same mapping. |
| [x] Fixed | HTML | Duplicate `<title>` tag in `index.html` | Removed the duplicate. |
| [x] Fixed | PWA / Cache | SW cached Supabase API error responses | Excluded `supabase.co` URLs from SW cache. Bumped to SW v5.1 (Neutral/Bypass). |

### Status
- **Overall Status:** DEPLOYED & STABLE (5 runtime bugs fixed)
- **Last Updated:** 2026-03-20 — Fixed auth, data display, and SW caching bugs.


