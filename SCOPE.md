# Sol-Fa Sanctuary — Scope Control Rules

> Read this before every task. These rules are non-negotiable.

---

## General Rules
1. **Only modify files explicitly mentioned in the task** — do not touch anything else
2. **Never refactor working code** unless the task specifically says to
3. **Never install new dependencies** without asking first and getting confirmation
4. **Never rename files or folders** unless explicitly instructed
5. **Never delete code** — comment it out and add a note if removal is needed
6. **Return only the changed file(s)** — not the entire project

---

## Migration Rules (Firebase → Supabase)
- Do not remove any Firebase file until its Supabase replacement is confirmed working
- Keep `firebase.ts` until `supabase.ts` is fully functional
- Keep Firestore rules until Supabase RLS policies are live and tested
- If migrating one service, do not touch other services in the same session

---

## When Unsure
- If a task is ambiguous about which files to touch → ask before proceeding
- If a task requires touching more files than expected → flag it and ask
- If a required supporting file has not been read yet → read it from the project root before proceeding

---

## Output Format
- Return modified files one at a time with a clear filename header
- After all code output, append the updated `PROGRESS.md` block
- If `CONTEXT.md` needs updating, flag it with: ⚠️ CONTEXT.md UPDATE NEEDED: [reason]
