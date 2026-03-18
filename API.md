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
| `file_size` | text | Formatted size (e.g. "1.2 MB") |
| `views` | int4 | Default 0 |
| `downloads` | int4 | Default 0 |
| `is_public` | bool | Default false |
| `is_admin_restricted` | bool | Default false |
| `thumbnail_url` | text | Public URL from Supabase Storage |
| `pdf_url` | text | Public URL from Supabase Storage |
| `uploaded_by` | text | User email (matches Auth login) |
| `user_id` | uuid | Matches Supabase Auth `user.id` |

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Matches Supabase Auth `user.id` |
| `display_name` | text | Full name or nickname |
| `email` | text | Primary contact email |
| `role` | text | `admin` or `user` |
| `status` | text | `Active`, `Inactive`, etc. |
| `created_at` | timestamptz | Auto set on insert |

### `interactions`
| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (unique string e.g. `user_id_sheet_id_type`) |
| `user_id` | uuid | FK → `profiles.id` |
| `sheet_id` | uuid | FK → `sheets.id` |
| `type` | text | `views` or `downloads` |
| `created_at` | timestamptz | Auto set on insert |


---

## Storage Buckets
| Bucket | Contents | Access |
|---|---|---|
| `sheets` | Uploaded PDF files | Public (for discovery) |
| `thumbnails` | Thumbnail images | Public |

---

## Auth
- Providers: Email/Password, Google OAuth
- Session: Managed by Supabase Auth (`supabase.auth`)
- Role check: Via `profiles.role` column, not JWT claims

---

## Row Level Security (RLS)
- `sheets`: Public can read `is_public = true` rows. Authenticated users can insert. Admins can update/delete all.
- `profiles`: Users can read/update own row. Admins can read all.

---

## Environment Variables (`.env.local`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

> ⚠️ AI Instruction: If new tables, columns, or buckets are added during a session, update this file before ending the session.
