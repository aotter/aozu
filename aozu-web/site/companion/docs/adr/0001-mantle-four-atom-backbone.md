# ADR-0001: Use Mantle's Four Atoms as the Declarative Runtime Backbone

- Status: Accepted
- Date: 2026-08-30

## Context

Companion must support experiences with different progress shapes, including
habits, skill development, relationships, branching stories, collections, and
resource management. A fixed application schema would make each new experience
a code change. Completely unstructured JSON would accept those shapes but would
not provide reliable validation, querying, stage progression, or migrations.

Mantle already provides the required middle ground:

- a stable entry envelope with flexible `data`;
- JSON Schema-defined collections;
- parse, link, cross-schema, and entry validation;
- a declarative grammar built from `Schema`, `View`, `Procedure`, and `Trigger`;
- a runtime whose application rules depend on semantic ports rather than one
  persistence technology.

Companion also needs one stable projection that its UI can render regardless of
the selected purpose template.

## Decision

Companion will use `@aotter/mantle-spec` and `@aotter/mantle-runtime` as the
declarative core. Dependency versions will be pinned while Mantle remains
prerelease software.

Mantle's four atoms have the following Companion responsibilities:

| Atom | Responsibility |
| --- | --- |
| `Schema` | Define characters, runs, stages, dialogue, rules, progress events, and memories |
| `View` | Project current stage, current dialogue, and progress summaries |
| `Procedure` | Submit actions, record progress, and resolve agent turns |
| `Trigger` | Connect MCP and lifecycle events to trusted procedures |

Entries retain a stable envelope while collection-specific data stays flexible:

```ts
interface Entry {
  id: string
  collection: string
  status: ContentState
  version: number
  data: Record<string, unknown>
  createdAt: number
  updatedAt: number
}
```

The React application will not read collection-specific data directly. It will
consume a stable stage projection through a translation layer:

```ts
interface ProgressSummary {
  id: string
  label: string
  value: string | number
  max?: number
}

interface StageProjection {
  stageId: string
  revision: number
  status: "active" | "completed" | "blocked"
  title: string
  narrative: string
  scene?: {
    compositionId: string
    characterStateId?: string
  }
  actions: Array<{ id: string; label: string }>
  progress: ProgressSummary[]
}
```

Purpose-specific data may remain in Mantle entries, but the React application
does not render opaque collection data. New UI needs either an existing stable
projection field or an explicit translation-layer change.

Scene images are formal bundle assets. `scene-assets` entries hold Blob
identity, media type, dimensions, byte size, and digest; `scene-compositions`
entries hold ordered `back` and `front` layers. A stage references one
composition by `scene.compositionId`. Rendering order is scene back layers,
character layers, then scene front layers. Single-image backgrounds use the
same model with one back layer.

The initial browser profile supports:

- Schema manifests;
- declarative Views using `from`, filters, fields, ordering, and limits;
- builtin Procedures;
- allowlisted referenced Procedures supplied by Companion;
- lifecycle Triggers;
- MCP Triggers translated to WebMCP tool registration when that browser
  capability is available.

Native SQL Views and HTTP Triggers are outside the initial browser profile.
WebMCP is an optional adapter capability: its absence does not block startup,
bundle import, local persistence, or local Procedures and Views.

## Consequences

- New progress shapes can be introduced through validated manifests and entries
  instead of application rewrites.
- The UI remains independent of purpose-specific schemas.
- Mantle owns atom semantics, input validation, optimistic versions, lifecycle
  behavior, and handler resolution.
- Companion must maintain a small translation layer between Mantle MCP Triggers
  and browser WebMCP registration.
- Without WebMCP, agent-dependent work remains pending while the local runtime
  and prepared interactions continue to work.
- A bundle that uses unsupported Mantle features fails validation instead of
  receiving a partial browser implementation.
- Companion does not create a second progress-schema engine.
