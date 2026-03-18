# Sol-Fa Sanctuary — Stack Reference

> Read this for any task involving components, styling, libraries, or dependencies.
> Always use the exact versions listed here. Do not suggest upgrades unless asked.

---

## Exact Versions
| Package | Version |
|---|---|
| React | 19.x |
| TypeScript | 5.x |
| Vite | 6.x |
| Tailwind CSS | 3.x |
| Lucide React | latest |
| Supabase JS | v2.x |
| @sentry/react | v8.x |

---

## React
- Use functional components only — no class components
- Use React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`)
- No prop drilling beyond 2 levels — use context or local state lifting

---

## TypeScript
- All components must be typed — no `any` unless absolutely unavoidable
- Shared types live in `types.ts` at the root
- Do not duplicate type definitions — import from `types.ts`

---

## Tailwind CSS
- Use Tailwind utility classes only — no inline styles unless unavoidable
- Icons via Lucide React: `import { IconName } from 'lucide-react'`
- Responsive classes: `sm:`, `md:`, `lg:` prefixes

---

## Supabase JS v2
```ts
// Client init (supabase.ts)
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Query example
const { data, error } = await supabase.from('sheets').select('*')

// Auth example
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
```

---

## Vite
- Env variables must be prefixed with `VITE_` to be accessible in the client
- Access via `import.meta.env.VITE_VARIABLE_NAME`

---

## PWA
- Service Worker: `sw.js` in root — do not modify during backend migration
- Manifest: `public/manifest.json`

---

> ⚠️ AI Instruction: If a new package is installed during a session, add it to the versions table above.
