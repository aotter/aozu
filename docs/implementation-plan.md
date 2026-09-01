# Companion Implementation Plan

Status: **Completed — 2026-08-30**

Follow-up product work is tracked in
[next-implementation-plan.md](next-implementation-plan.md); this completed plan
remains the historical record of the initial eleven slices.

## Build mode

- Autonomous, sequential vertical slices.
- Every slice ends with the smallest runnable check, black-box smoke test,
  in-app browser verification when UI behavior changes, self-review, and a local
  commit.
- A failed check is fixed inside the current slice. No speculative scaffolding
  for later slices.
- No GitHub repository, push, deployment, marketplace, entitlement provider,
  generic unit of work, generic NLP, or additional rig profile in this plan.

## Slices

1. **Mantle backbone** — pin Mantle prerelease dependencies and compile one
   minimal Fixed Backbone with run, stage, progress-event, `current-stage`, and
   `submit-companion-action` contracts.
2. **IndexedDB Mantle storage** — implement the required entry/read/view
   semantic ports and prove hydrate plus optimistic concurrency across reloads.
3. **Bundle activation** — store manifests and entries by bundle namespace,
   validate candidates after read-back, and atomically swap `activeBundleId`.
4. **Projection and action transaction** — translate the active runtime into a
   stable `StageProjection` and atomically commit one local action plus its
   progress event.
5. **Local Playbook path** — implement the minimal closed Condition/Effect
   vocabulary, deterministic ordering, limits, and hot-path actions.
6. **Agent Playbook path** — add exact warm matching, persisted cold turns,
   idempotent agent resolution, and interruption recovery.
7. **Authored bundle boundary** — overlay Fixed Backbone, one Purpose Template,
   and allowlisted Agent Customization through diagnostics, preview, approval,
   and activation.
8. **Optional WebMCP adapter** — expose the existing application use cases as
   tools without making WebMCP an application gate.
9. **Character rig and packs** — port the proven strict RGBA/dimension/digest
   validation and deterministic multi-layer renderer into the formal boundary.
10. **Functional items** — add canonical inventory/loadout state, capabilities,
    item actions, trusted appearance facts, and cosmetic overrides.
11. **Portable round trip** — export and import manifests, entries, journal,
    inventory, character packs, and Blob assets; finish with one end-to-end
    browser scenario.

## Required gates

Each slice must pass relevant focused checks plus the repository-wide gates:

```text
pnpm test
pnpm lint
pnpm build
```

Trust-boundary slices also require adversarial fixtures. UI slices require an
in-app browser smoke test with no console errors. The final slice must prove an
export → clear → import round trip and the same user-visible state afterward.

## Completion evidence

- All eleven slices are committed locally on `main`.
- `pnpm test`, `pnpm lint`, and `pnpm build` pass.
- A fresh-origin browser round trip restored the same revision, stage,
  actions, progress, loadout, and WebMCP projection with no console errors.
- A tampered archive was rejected without changing the active bundle.
