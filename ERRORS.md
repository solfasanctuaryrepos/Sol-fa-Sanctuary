# Sol-Fa Sanctuary — Known Errors & Fixes

> Read this during debugging sessions before attempting any fix.
> If you fix a new bug, append it here.

---

## Format
```
### [Error title or message]
- **Context**: Where/when it happens
- **Cause**: Root cause
- **Fix**: What solved it
- **Date**: When it was encountered
```

---

## Firebase (Pre-migration)

### Firebase App Check failing in dev
- **Context**: `app-check` throws on localhost
- **Cause**: ReCaptchaV3 doesn't work on localhost by default
- **Fix**: Add `localhost` to allowed domains in Firebase Console > App Check, or disable enforcement in dev using `isTokenAutoRefreshEnabled: false`
- **Date**: During initial setup

---

## Supabase (Migration)

### `createClient` crash on missing env vars
- **Context**: App fails to render at all — blank page
- **Cause**: `import.meta.env.VITE_SUPABASE_URL` returns `undefined` when env vars are missing, and `createClient(undefined, undefined)` throws a runtime error
- **Fix**: Added `|| ''` fallback: `const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''`
- **Date**: 2026-03-20

### Service Worker caches aggressive navigation/API responses
- **Context**: Music sheets show on first load but then disappear or stay empty after refresh
- **Cause**: SW v3/v4 cached same-origin assets and potentially intercepted navigation. A cached error/empty response would be served on subsequent loads.
- **Fix**: Rewrote SW to explicitly bypass navigation, same-origin app bundles, and Supabase API. Bumped SW to v5.1.
- **Date**: 2026-03-20

---

## Auth

### `saveUserProfile` never called after signup
- **Context**: New user profiles missing `display_name` in the `profiles` table
- **Cause**: `saveUserProfile()` was defined in `AuthModal.tsx` but never invoked in the signup success block. Also, `display_name` was not included in the upsert payload.
- **Fix**: Added `await saveUserProfile(data.user, displayName)` after successful signup. Added `display_name` to the upsert payload.
- **Date**: 2026-03-20

### Deep-linked sheets have undefined fields
- **Context**: Opening a `?sheet=<id>` URL shows a broken preview with no image/title
- **Cause**: Deep-link fetch in `App.tsx` set raw Supabase row data (snake_case) as `activePreview`, but components expect camelCase (`thumbnailUrl`, `pdfUrl`, etc.)
- **Fix**: Applied the same `snake_case → camelCase` mapping used in `fetchSheets`
- **Date**: 2026-03-20

---

## UI / Frontend

> No entries yet

---

> ⚠️ AI Instruction: When a bug is found and fixed during a session, append the entry here before ending the session.
