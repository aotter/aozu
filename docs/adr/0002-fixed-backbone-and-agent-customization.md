# ADR-0002: Protect a Fixed Backbone and Validate Agent-Authored Customization

- Status: Accepted
- Date: 2026-08-30

## Context

An AI agent will create characters and experiences. It needs enough freedom to
define personalities, progress payloads, dialogue, decisions, stages, rewards,
and scenes. It must not be able to remove required runtime capabilities, change
trusted handlers, introduce executable code, or produce a bundle that cannot
advance.

Most story content is instance data, not new infrastructure. Asking an agent to
rewrite all four Mantle atoms for every character would increase failures and
make compatibility difficult to preserve.

Purpose templates must provide useful defaults while still producing portable,
self-contained bundles.

## Decision

Every resolved bundle is assembled from three layers:

```text
Fixed Backbone + Purpose Template + Agent Customization = Resolved Bundle
```

### Fixed Backbone

Companion owns the required Schemas, Views, Procedures, Triggers, handler
references, lifecycle rules, revision fields, and idempotency fields. These
parts are immutable to the agent.

At minimum, the backbone exposes a `current-stage` View and a `submit-action`
Procedure whose output conforms to `StageProjection` from ADR-0001.

### Purpose Template

A template selects Progress Loops, supplies default schema slots and seed
entries, and provides authoring guidance. Fitness, romance, and narrative
adventure are templates, not engine-level types.

Each template declares a completion mode. A `finite` experience is expected to
reach a terminal stage; a `continuous` experience may intentionally keep a
habit, relationship, or care loop running indefinitely.

### Agent Customization

The agent primarily writes validated entries for characters, stages, dialogue,
rules, memories, and initial state. It may replace only explicitly allowlisted
manifest paths, such as a progress event's nested payload schema or localized
titles and descriptions.

The agent may use Mantle builtins and a closed set of referenced handlers
registered by Companion. It cannot supply JavaScript, file paths, unknown
handler names, SQL Views, or HTTP Triggers.

Gameplay rules are entries evaluated by a trusted Companion handler. They are
not represented as one Mantle Trigger per game rule. Mantle Triggers remain the
infrastructure routing mechanism for MCP and lifecycle events.

### Assembly and validation

YAML is parsed before merging. Companion never merges YAML text. An object-level
overlay copies only allowlisted paths from an agent proposal into the selected
backbone and template.

Candidate bundles pass these gates in order:

1. Mantle parse, grammar, link, and cross-schema validation.
2. Locked-path validation against the selected backbone and template.
3. Procedure input/output and handler allowlist validation.
4. Entry validation against resolved JSON Schemas.
5. Companion semantic validation:
   - the initial stage exists;
   - every transition target exists;
   - every reachable non-terminal stage provides an unconditional local route
     or an explicit persisted agent fallback;
   - all non-draft stages and dialogue intended for play are reachable from the
     initial stage;
   - finite experiences have a reachable terminal stage and no reachable closed
     component without an exit or persisted agent fallback;
   - continuous experiences may contain intentional cycles;
   - conditions and effects use the closed runtime vocabulary;
   - condition depth, rule count, effect count, and graph size stay within the
     versioned browser import profile;
   - referenced metrics, items, stages, dialogue nodes, and assets exist;
   - the required Views and Procedures satisfy their interface contracts.
6. Candidate preview and explicit user approval before activation.

Validation diagnostics are returned to the authoring agent for repair. Raw
authoring data, future branches, hidden conditions, and validation retries are
not shown in the normal player interface.

An agent fallback remains valid when WebMCP is unavailable because it creates a
persisted pending turn. It never makes the bundle or the rest of the local
experience unavailable.

Each bundle records at least:

```ts
interface BundleIdentity {
  contractVersion: number
  backboneVersion: string
  templateId: string
  templateVersion: string
}
```

Exports contain the resolved manifests and data, not only references to a
template installed on the current site.

## Consequences

- Agent creativity is limited at execution boundaries but remains flexible in
  content and declared data shapes.
- A template update cannot silently change an already exported experience.
- Backbone upgrades require an explicit migration keyed by backbone and
  contract version.
- Product-level hidden content is not treated as a security boundary; a user
  can inspect data stored on their own device or exported ZIP.
- Validation rejects unsupported capability rather than attempting to repair or
  execute it.
