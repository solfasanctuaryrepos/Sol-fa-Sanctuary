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

> No entries yet — add fixes here as migration progresses

---

## Auth

> No entries yet

---

## UI / Frontend

> No entries yet

---

> ⚠️ AI Instruction: When a bug is found and fixed during a session, append the entry here before ending the session.
