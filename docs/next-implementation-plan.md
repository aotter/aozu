# Companion Next Implementation Plan

Status: **Active — 2026-08-30**

## Confirmed product semantics

- One browser origin may retain many Companion bundles, with at most one active
  bundle selected by the global pointer.
- A preset is an editable seed. Import and authoring candidates remain inactive
  until validation, preview, and explicit user approval complete.
- Current operational and authoring entries may be updated with validation and
  optimistic concurrency. Progress and journal history is append-only.
- Bundle pointer-swap is reserved for initial publication, import, migration,
  manifest or template identity changes, and whole-experience replacement.

## Slices

1. **Candidate review boundary — completed 2026-08-30** — edit a preset seed,
   stage preset and ZIP candidates, present a minimal preview, and activate only
   from an explicit user action.
2. **Authoring editor** — let preset and current content edit character,
   wardrobe, story, and task data before one validated publish operation.
3. **Bundle library** — list retained valid bundles and switch the single active
   pointer without copying their data.
4. **Cross-pack wardrobe** — resolve qualified appearances from installed packs
   sharing one rig profile; keep each pack default and its assets self-contained.
5. **Journal surface** — project append-only progress events and retained agent
   turns without treating them as a replay engine.

Each slice ends with the smallest focused check, repository-wide build/lint/test
gates, an in-app browser smoke test for UI behavior, self-review, and a local
commit. Multi-tab activation, automatic garbage collection, deterministic event
replay, remote packs, and deployment remain deferred until a real requirement
appears.
