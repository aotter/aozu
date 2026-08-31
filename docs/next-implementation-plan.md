# Companion Next Implementation Plan

Status: **Active — 2026-08-30**

## Confirmed product semantics

- One browser origin may retain many Companion bundles, with at most one active
  bundle selected by the global pointer.
- A static Starter selection is a persistent Experience Draft, not executable
  content. An agent-completed candidate and imported bundle remain inactive
  until validation, preview, and explicit user approval complete.
- Current operational and authoring entries may be updated with validation and
  optimistic concurrency. Progress and journal history is append-only.
- Bundle pointer-swap is reserved for initial publication, import, migration,
  manifest or template identity changes, and whole-experience replacement.

## Slices

1. **Candidate review boundary — completed 2026-08-31** — select a data-driven
   Starter, complete it through the WebMCP-to-Mantle Trigger boundary, stage
   Starter and ZIP candidates, present a meaningful preview, and activate only
   from an explicit user action.
2. **Authoring editor — character stage 1 completed 2026-08-30** — create a
   character from a persistent blank draft; accept user uploads and WebMCP
   candidates for fixed full-body, whole-head expression, outfit, and two-layer
   prop slots; validate, preview, and explicitly save reusable Character Pack
   data without synthesizing or activating a Playbook.
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
