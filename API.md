# Sol-Fa Sanctuary — Backend / API Reference

> Read this for any task involving database, auth, storage, or API calls.
> Do not invent table names, column names, or bucket names — use only what is defined here.

---

## Supabase Client
- File: `supabase.ts` (root) — being created as part of migration
- Import: `import { supabase } from './supabase'`

---

## Database Tables (PostgreSQL)

### `sheets`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `title` | text | Sheet title |
| `composer` | text | Composer name |
| `type` | text | Sheet type/category |
| `uploaded_at` | timestamptz | Auto set on insert |
| `file_size` | int8 | In bytes |
| `views` | int4 | Default 0 |
| `downloads` | int4 | Default 0 |
| `is_public` | bool | Default false |
| `is_admin_restricted` | bool | Default false |
| `thumbnail_url` | text | Public URL from Supabase Storage |
| `pdf_url` | text | Public URL from Supabase Storage |
| `uploaded_by` | uuid | FK → `users.id` |

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Matches Supabase Auth `user.id` |
| `display_name` | text | — |
| `email` | text | — |
| `role` | text | `admin` or `user` |
| `status` | text | `active`, `suspended`, etc. |
| `created_at` | timestamptz | Auto set on insert |

---

## Storage Buckets
| Bucket | Contents | Access |
|---|---|---|
| `sheet-pdfs` | Uploaded PDF files | Private (signed URLs) |
| `sheet-thumbnails` | Thumbnail images | Public |

---

## Auth
- Providers: Email/Password, Google OAuth
- Session: Managed by Supabase Auth (`supabase.auth`)
- Role check: Via `users.role` column, not JWT claims

---

## Row Level Security (RLS) — Planned
- `sheets`: Public can read `is_public = true` rows. Auth users can insert. Admins can update/delete all.
- `users`: Users can read/update own row. Admins can read all.

---

## Environment Variables (`.env.local`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

> ⚠️ AI Instruction: If new tables, columns, or buckets are added during a session, update this file before ending the session.
