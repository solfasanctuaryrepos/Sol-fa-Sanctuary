# Sol-fa Sanctuary — Completion Roadmap

> This document tracks all known incomplete features and proposed fixes, ordered by priority.
> Update this file as items are completed.

---

## Priority 1 — Dead Code Cleanup

### 1.1 Remove `PreviewModal.tsx`
- **Status:** Pending
- **What:** `components/PreviewModal.tsx` is an abandoned modal-based preview component superseded entirely by `FullPreviewPage.tsx`.
- **Fix:** Delete the file. Remove any lingering import or reference in `App.tsx` if present.

---

## Priority 2 — Broken UI (Buttons with no function)

### 2.1 Share Button
- **Status:** Pending
- **Location:** `components/FullPreviewPage.tsx`
- **What:** A "Share" button renders in the sheet preview page but does nothing.
- **Fix:** Implement the [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) with a fallback to clipboard copy.
  ```ts
  // Preferred: navigator.share({ title, url })
  // Fallback: navigator.clipboard.writeText(window.location.href)
  ```
  The shareable URL should use the existing deep-link format: `?sheet=<id>`.

### 2.2 Print Button
- **Status:** Pending
- **Location:** `components/FullPreviewPage.tsx`
- **What:** A "Print" button renders but does nothing.
- **Fix:** Call `window.print()`. Optionally add a `@media print` CSS rule in `index.css` to hide the navbar and buttons for a clean print output.

---

## Priority 3 — About Page Social Links

### 3.1 GitHub and LinkedIn Buttons
- **Status:** Pending
- **Location:** `components/AboutPage.tsx`
- **What:** GitHub and LinkedIn buttons render but have no `href` links.
- **Fix:** Add the correct URLs to each button's anchor tag. Confirm the exact profile URLs with the project owner (Vitalis Nkwenti) before hardcoding.

---

## Priority 4 — Email Verification Re-send Flow

### 4.1 Re-send Verification Email
- **Status:** Pending (workaround in place)
- **Location:** `components/UploadModal.tsx`
- **What:** The current re-send uses `resetPasswordForEmail` (the password reset API) as a workaround, which sends the wrong type of email.
- **Fix:** Replace with the correct Supabase method:
  ```ts
  await supabase.auth.resend({ type: 'signup', email: user.email })
  ```
  This sends a proper email verification link, not a password reset link.

---

## Priority 5 — Analytics UI (Interactions Table)

### 5.1 Surface View/Download Analytics
- **Status:** Pending
- **Location:** `components/AdminDashboard.tsx` and/or `components/Dashboard.tsx`
- **What:** The `interactions` table in Supabase tracks unique views and downloads per user, but this data is never surfaced in the UI. Admins and users only see aggregate counters on each sheet.
- **Fix (Admin):** Add a third tab `'analytics'` in `AdminDashboard.tsx` showing:
  - Top 5 most viewed sheets
  - Top 5 most downloaded sheets
  - Total unique users who interacted
  - Query: `db.from('interactions').select('sheet_id, type').eq('type', 'views')` etc.
- **Fix (User Dashboard):** Optionally show a small sparkline or "X unique viewers" stat per sheet card.

---

## Completed

- [x] Firebase → Supabase migration
- [x] Production deployment (Coolify / VPS)
- [x] Auth (email/password + Google OAuth)
- [x] Full CRUD for music sheets
- [x] Admin dashboard (users + content tabs)
- [x] Real-time sync (Supabase subscriptions)
- [x] PDF preview with lazy-loading
- [x] PWA (installable, deep-linking)
- [x] Dark/light mode
- [x] Removed Sentry (`@sentry/react`) — 2026-04-06
