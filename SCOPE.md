# Sol-Fa Sanctuary — Scope & Behavior Rules
> Read this at every session start, right after CONTEXT.md and PROGRESS.md.
> These rules govern everything you do in this project. They are non-negotiable.

---

## 1. Code Rules — What You Can Touch
- Only modify files explicitly mentioned in the current task
- Never refactor working code unless the task specifically says to
- Never install new dependencies without asking first and getting confirmation
- Never rename or delete files — comment out and flag instead
- Never assume a migration is complete — check PROGRESS.md first
- Return only changed files — not the entire project

---

## 2. Plan Before Execute Rule
For any task involving more than one file or more than one step, you MUST follow this sequence:

```
STEP 1 — THINK (use strongest available model)
  Read all relevant .md files
  Diagnose the problem fully
  Design the solution
  Write PLAN.md (see PLAN.md for format)
  Present the plan to the user
  Wait for approval before writing any code

STEP 2 — EXECUTE (cheaper model is sufficient)
  Read PLAN.md
  Execute one step at a time
  Mark each step ✅ in PLAN.md as it is completed
  Do not skip steps or combine steps

STEP 3 — VERIFY (stronger model preferred)
  Confirm the output matches the plan
  Run type check mentally: tsc --noEmit
  Flag anything that looks wrong before closing
```

Never skip Step 1. A plan that takes 2 minutes to write saves hours of broken code.

---

## 3. Model Routing Protocol
This project uses a two-model strategy to save cost. You must follow it:

### 🧠 Thinker Tasks — Use the strongest available model
These tasks require deep reasoning. Do not attempt them with a weak model:
- Diagnosing bugs and finding root causes
- Designing architecture or data models
- Writing or revising PLAN.md
- Making decisions that affect multiple files
- Reviewing final output for correctness
- Any task where the wrong answer breaks something

### ⚙️ Executor Tasks — A cheaper model is sufficient
These tasks follow clear instructions. A cheaper model handles them well:
- Implementing steps from an approved PLAN.md
- Writing boilerplate or repetitive code
- Making changes to a single isolated file
- Renaming variables, updating constants
- Following a pattern already established in the codebase

### 🔁 When to Signal a Model Switch
You cannot switch models yourself. You must tell the user when to switch.

Signal to switch to a stronger model when:
- You encounter something not covered in PLAN.md
- A step requires an architectural decision
- Something broke and you cannot identify why
- The task scope is larger than it first appeared

Use this exact format to signal:
```
⚠️ MODEL SWITCH NEEDED
Reason: [why a stronger model is needed]
State: [what has been completed so far]
Next step: [what the stronger model should do first]
Resume from: PLAN.md Step [N]
```

Signal to switch to a cheaper model when:
- PLAN.md is written and approved
- The next steps are purely implementation
- No architectural decisions remain

Use this exact format:
```
✅ READY FOR EXECUTOR
Plan is approved and complete.
Switch to a cheaper model.
Instruction: Read CONTEXT.md, PROGRESS.md, SCOPE.md, and PLAN.md — then execute from Step [N].
```

---

## 4. Migration Rules (Firebase → Supabase)
- Do not remove any Firebase file until its Supabase replacement is confirmed working
- Keep `firebase.ts` until `supabase.ts` is fully tested
- Migrate one service per session — do not mix Auth + DB + Storage in one go
- Check PROGRESS.md migration table before starting any backend task

---

## 5. Output Format
Every response that includes code must end with:

```
---
📋 FILES CHANGED: [list of files modified]
📌 PLAN.md STATUS: [updated / no active plan]
📊 PROGRESS.md: [updated / no changes needed]
⚠️ FLAGS: [any files that need updating, or "none"]
```

This footer keeps every session's output auditable at a glance.
