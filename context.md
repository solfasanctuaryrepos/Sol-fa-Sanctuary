# Sol-Fa Sanctuary — Project Context
> This is the single entry point for AI sessions. Read this file first, then follow the instructions below.

---

## Project Overview
Sol-Fa Sanctuary is a specialized platform for discovering, managing, and sharing Tonic Sol-fa music sheets. It provides a niche community for musicians to access, preview, and upload scores, focusing on a premium, responsive user experience (PWA-ready).

---

## Technology Stack
- **Frontend Core**: React 19, TypeScript
- **Styling**: Tailwind CSS (Lucide React for icons)
- **Build Tool**: Vite 6
- **Backend/Infrastructure**: ~~Firebase~~ → Supabase (migration completed — see PROGRESS.md)
- **PWA**: Service Worker (`sw.js`), Manifest (`manifest.json`)

---

## Project Structure
```
/
├── components/          # React components (modals, pages, UI elements)
├── firebase.ts          # Firebase init — being replaced by supabase.ts
├── App.tsx              # Main application logic & routing
├── types.ts             # Global TypeScript interfaces (MusicSheet, User, etc.)
├── constants.ts         # Shared constants
├── firestore.rules      # Firebase DB rules — being deprecated
├── storage.rules        # Firebase storage rules — being deprecated
├── public/              # Static assets (icons, manifest)
└── sw.js                # PWA Service Worker
```

---

## Core Features
1. **Music Library** — Browse and search public music sheets
2. **Dashboard** — User view for managing uploaded content
3. **Admin Dashboard** — Admin-only view for managing users and content (role via email)
4. **Music Preview** — Full-page high-fidelity preview of sheets (PDF/Image)
5. **Secure Uploads** — Structured upload flow with metadata
6. **Authentication** — Email/Password and Google sign-in
7. **PWA** — Installable on mobile (iOS/Android) with deep-linking

---

## Data Models (`types.ts`)
- **MusicSheet**: `id`, `title`, `composer`, `type`, `uploadedAt`, `fileSize`, `views`, `downloads`, `isPublic`, `isAdminRestricted`, `thumbnailUrl`, `pdfUrl`, `uploadedBy`
- **User**: `id`, `displayName`, `email`, `role` (admin/user), `status`, `createdAt`

---

## Development Commands
- **Dev server**: `npm run dev`
- **Build**: `npm run build`
- **Type check**: `tsc --noEmit`
- **Env file**: `.env.local` (Supabase keys, Gemini API)

---

## 🗂️ Supporting Files Index
All files below are in the project root. Read them directly — do not ask the user to paste them.

### Always read at session start:
- `PROGRESS.md` — current state, active migration status, what's done and what's pending
- `SCOPE.md` — rules for what you can and cannot touch during any task

### Read based on task type:

| Task Type | Files to Read |
|---|---|
| UI / frontend / components | `STACK.md` |
| Backend / database / auth / storage | `API.md`, `STACK.md` |
| Debugging / fixing errors | `ERRORS.md` |
| Suggesting libraries or architecture changes | `DECISIONS.md` |
| Resuming after a long break | `PROGRESS.md` (read carefully before doing anything) |
| Any task touching the stack or dependencies | `STACK.md`, `DECISIONS.md` |

---

## 🤖 AI Standing Instructions
1. At session start — read `CONTEXT.md`, `PROGRESS.md`, and `SCOPE.md` before anything else
2. Before any task — check the table above and read the relevant files
3. After any session where code was changed — update `PROGRESS.md` to reflect what was done
4. If the stack, data models, or file structure changed — update the relevant section in this file (`CONTEXT.md`)
5. If a migration is in progress — never assume it is complete unless `PROGRESS.md` says so
6. If you made an architectural decision — append it to `DECISIONS.md`
7. If a bug was found and fixed — append it to `ERRORS.md`
8. Never modify files outside the scope of the current task — see `SCOPE.md`
