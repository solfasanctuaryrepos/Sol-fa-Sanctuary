# Sol-Fa Sanctuary — Architecture Decisions

> Read this before suggesting alternative libraries, services, or approaches.
> Every entry here was a deliberate choice. Do not re-suggest rejected options.

---

## Backend

### Supabase over Firebase
- **Decision**: Migrate from Firebase to Supabase
- **Reason**: Google Cloud rejects prepaid cards in Cameroon (dev's location). Supabase billing is more accessible and the PostgreSQL model is more flexible for relational queries on sheet metadata.
- **Date**: Migration started after initial scaffold

---

## Frontend

### React 19 + Vite 6
- **Decision**: Use latest React and Vite
- **Reason**: Firebase Studio scaffolded this. Keeping it for performance and modern features (React compiler, faster HMR).

### Tailwind CSS
- **Decision**: Tailwind over CSS modules or styled-components
- **Reason**: Faster UI development, consistent design system, pairs well with Lucide icons.

---

## PWA
### Service Worker (`sw.js`) — Keep as-is during migration
- **Decision**: Do not touch PWA files during Firebase → Supabase migration
- **Reason**: PWA layer is independent of backend. Changing it simultaneously increases risk.

---

## Security
### Supabase RLS over Firebase App Check
- **Decision**: Replace App Check (ReCaptchaV3) with Supabase Row Level Security
- **Reason**: RLS is built into Supabase and enforced at the database level. More granular and does not require external ReCaptcha setup.

---

> ⚠️ AI Instruction: When you make or recommend an architectural decision during a session, append it here using the same format above.
