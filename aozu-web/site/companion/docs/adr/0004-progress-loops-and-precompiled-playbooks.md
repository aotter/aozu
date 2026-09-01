# ADR-0004: Compose Experiences from Progress Loops and Precompiled Playbooks

- Status: Accepted
- Date: 2026-08-30

## Context

Fitness, romance, narrative adventure, study, pet care, and saving goals appear
to be separate genres, but their mechanics overlap. Encoding each as a separate
engine would duplicate progress, rule, stage, and reward behavior.

Player interaction must usually respond immediately without waiting for an AI
agent on every turn. At the same time, free-form dialogue and unexpected player
actions benefit from agent improvisation. The proof of concept demonstrated a
useful await-input and recovery flow that can persist work across interrupted
agent turns.

Fully expanding every dialogue choice into a tree is not viable because branch
count grows exponentially.

## Decision

### Progress Loops

Purpose templates compose reusable Progress Loops:

| ID | Name | State model |
| --- | --- | --- |
| `rhythm` | Rhythm | recurrence, streaks, cadence, and missed intervals |
| `mastery` | Mastery | proficiency, milestones, prerequisites, and unlocks |
| `bond` | Bond | trust, affinity, relationship stages, and shared memories |
| `journey` | Journey | stages, quests, branches, and world flags |
| `discovery` | Discovery | collections, map nodes, knowledge, and completion |
| `stewardship` | Stewardship | resources, maintenance, growth, and decay |
| `challenge` | Challenge | attempts, scores, time limits, and outcomes |

Loops are presets and authoring guidance, not separate runtime modules. They
compose a small shared vocabulary:

```text
Metric, Flag, Stage, Rule, Effect, Inventory, Memory
```

Examples:

```text
fitness  = rhythm + mastery + challenge
romance  = bond + journey
MUD      = journey + discovery + challenge
study    = rhythm + mastery + journey
pet care = bond + stewardship
saving   = rhythm + stewardship + challenge
```

An empty custom template selects loops; it is not itself another loop.

### Precompiled Playbook

During character and experience creation, the agent authors a hidden Playbook
containing character dialogue, decision nodes, metrics, rewards, conditions,
effects, stage transitions, scene changes, and agent fallback points. The
Playbook is stored as validated entries under the fixed Mantle backbone.

Dialogue uses a graph with reusable and converging nodes, conditional variants,
and content pools. It is not stored as a fully expanded tree.

Conditions use a closed AST composed from comparisons plus `all`, `any`, and
`not`. Effects use a closed vocabulary such as adding a metric, setting a flag,
granting an item, changing stage or dialogue, changing scene, writing a memory,
or requesting an agent turn. Agent-authored code is never an effect.

Points are modeled as validated metric changes recorded through progress events.
Balances and summaries are deterministic projections rather than agent-written
totals.

### Three execution paths

The runtime chooses the least expensive path that can handle the interaction:

1. **Hot path:** a predefined choice is validated and executed locally.
2. **Warm path:** normalized free text exactly matches an agent-authored phrase
   or alias and executes locally.
3. **Cold path:** unmatched or deliberately open-ended input creates a persisted
   request for agent improvisation.

Phrase matching begins with normalized exact phrases and aliases. Ambiguous or
unmatched input takes the cold path. Contained-phrase matching and a general
browser NLP framework are deferred until exact matching is shown to be
insufficient.

Cold-path requests survive interruption:

```ts
interface PendingAgentTurn {
  id: string
  runId: string
  nodeId: string
  userText: string
  expectedRevision: number
  status: "pending" | "resolved" | "failed"
  createdAt: number
}
```

An agent resolution may return dialogue and validated effects in one operation.
The Companion `submit-action` repository from ADR-0003 applies them only when
`expectedRevision` still matches. It atomically records the resolved turn ID
with the resulting dialogue and effects; a repeated resolution is a no-op and a
stale resolution fails without partial writes.

There is no claim protocol while Companion has one agent consumer. If multiple
consumers become a requirement, a later decision may add expiring leases rather
than a permanent claimed state.

The cold path is reserved for unmatched free text, unexpected branches,
high-value special events, chapter replenishment, or explicit
`requestAgentTurn` rules. Normal choices and prepared dialogue do not wait for
an agent. When WebMCP is unavailable, cold-path requests remain pending and the
rest of the local experience remains usable.

### Deterministic execution limits

Rules execute in stable priority-then-ID order. Effects execute in declared
order inside the action transaction. The fixed backbone defines versioned
maximums for rule evaluations, trigger steps, and effects per action. Exceeding
a limit aborts the whole action and returns diagnostics; no partial effects are
committed.

## Consequences

- New purpose templates are mostly data recipes instead of new engines.
- Prepared interactions feel immediate and continue when the agent is absent.
- Agent improvisation remains available where it adds value rather than becoming
  a per-turn dependency.
- Decision graphs and reusable rules avoid exponential authoring growth.
- The runtime must define deterministic ordering, loop limits, and idempotency
  for rule effects.
- Hidden Playbook content improves presentation but is not confidential on a
  user-owned local device.
