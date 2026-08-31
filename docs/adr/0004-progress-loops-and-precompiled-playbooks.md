# ADR-0004: Compose Experiences from Progress Loops and One Shared Playbook Runtime

- Status: Accepted
- Date: 2026-08-30
- Updated: 2026-09-01

## Context

Fitness, romance, narrative adventure, study, pet care, and saving goals appear
to be separate genres, but their mechanics overlap. Separate engines would
duplicate facts, rules, stages, inventory behavior, persistence, and conflict
handling. Normal interactions must also remain immediate and local while
free-form dialogue may use an agent through the persisted cold path.

## Decision

### Contract layers

The system has six layers, in this order:

1. Mantle infrastructure atoms: `Schema`, `View`, `Procedure`, and `Trigger`.
2. Playbook primitives: declared facts, `Stage`, prepared `Action`, closed
   `Condition`, ordered closed `Effect`, `Rule`, append-only progress events,
   and stable projections.
3. Progress Loop recipes: reusable authoring patterns over those primitives.
4. Purpose Templates and Starter Directions: domain-specific compositions of
   recipes.
5. Agent-authored content: concrete facts, stages, rules, dialogue text, and
   asset references.
6. Resolved Game: ordinary validated entries executed by the shared runtime.

No Loop creates a Mantle Schema, collection, Procedure, Trigger, handler,
runtime module, or dispatch branch. Runtime code never receives Loop IDs.

### Progress Loop recipes

The authoring recipes remain:

| ID | Authoring pattern | Runtime support |
| --- | --- | --- |
| `mastery` | proficiency, milestones, prerequisites, unlocks | Supported |
| `journey` | stages, quests, branches, world flags | Supported |
| `bond` | trust, affinity, relationship stages, shared memories | Partial: facts and Stages work; shared memory is deferred |
| `discovery` | collections, map nodes, knowledge, completion | Partial: inventory, flags, and metrics work; map conventions remain authoring guidance |
| `stewardship` | resources, maintenance, growth, decay | Partial: resource changes work; clock-driven decay is deferred |
| `challenge` | attempts, scores, time limits, outcomes | Partial: attempts, scores, and outcomes work; time limits are deferred |
| `rhythm` | recurrence, streaks, cadence, missed intervals | Blocked on a separate time-semantics decision and implementation |

A recipe is a capability pattern, not a complete game, executable DSL, or
prefilled state. For example:

```text
mastery = action → accumulate progress → cross milestone → unlock
```

A Purpose Template binds those roles to facts such as `focus` or `trust`.
Recipes are not independently executed or blindly merged. Several recipes may
advance from one Action and one coherent fact snapshot:

```text
                    ┌─ mastery rules
shared Action ──────┼─ journey rules
                    └─ challenge rules
                           ↓
                    ordered Effects
                           ↓
                       new Facts
```

The authoring boundary resolves recipes, templates, and customization into
validated `stages + actions + rules + effects + entries`. There is no recipe
engine chain, callback system, synchronization layer, or event bus.

### Versioned bundle provenance

New authored bundles use contract version 2:

```ts
interface BundleIdentityV2 {
  contractVersion: 2
  backboneVersion: string
  templateId: string
  templateVersion: string
  loopIds: Array<
    | "rhythm"
    | "mastery"
    | "bond"
    | "journey"
    | "discovery"
    | "stewardship"
    | "challenge"
  >
  completionMode: "finite" | "continuous"
}
```

`loopIds` and `completionMode` are preserved provenance and authoring-validation
inputs only. Contract-version-1 bundles remain importable and executable
through their existing manifests; missing provenance is never invented.

### Closed Playbook contract

One Companion Playbook contract module is the source of truth for the JSON
Schema documents, TypeScript types, normalization, limits, and typed narrowing.
The fixed Mantle backbone imports those same Schema documents. Mantle
`EntryDataValidator` enforces the exact recursive grammar; Companion narrowing
enforces the same vocabulary plus versioned limits; candidate semantic
validation resolves cross-entry and graph invariants.

Conditions are exactly:

- metric comparison: `eq | gt | gte | lt | lte`;
- flag equality and current-Stage equality;
- capability, owned-definition, equipped-definition, and trusted-appearance
  presence;
- item-definition quantity comparison and item-instance state equality;
- recursive `all`, `any`, and `not`.

Effects are exactly:

- `addMetric`, `setFlag`, `changeStage`;
- `grantItem`, `consumeItem`, `equipItem`, `unequipItem`;
- `setItemState`, `setAppearanceOverride`.

`changeDialogue`, `changeScene`, `writeMemory`, and `requestAgentTurn` are not
Effects. A scene changes by entering a Stage that references another scene
composition. Cold-path agent turns remain an application use case. A future
dialogue-node graph requires its own decision; v2 stores optional inline
`currentDialogue` with a fixed length limit.

### Declared facts and candidate validation

V2 declares all initial metrics and flags. Conditions and Effects may reference
only those declared keys; a misspelling is rejected rather than created from
zero. Before staging, validation rejects:

- duplicate Stage, Action, Rule, progress-binding, or declared-fact IDs;
- normalized phrase collisions across Actions;
- unknown metrics, flags, Stages, item definitions, inventory instances,
  appearances, character states, or scene compositions;
- item instances that are neither initially present nor producible by a
  declared `grantItem` Effect;
- unsupported Conditions or Effects;
- unreachable non-draft Stages after Action and Rule transitions are included;
- finite graphs without a reachable terminal route or persisted agent fallback;
- continuous graphs without a continuing local route or persisted fallback.

Limits live in the same versioned contract. V2 permits at most 100 Rules,
Condition depth 10, and 50 Effects in one submitted Action transaction. Stage,
Action, and phrase bounds are fixed constants, not a configurable subsystem.

### Deterministic same-turn execution

Every local Action and agent resolution uses this cycle:

```text
validate Action and expected revision
→ plan Action Effects over run and item state
→ freeze one coherent post-Action fact snapshot
→ evaluate every Rule against that immutable snapshot
→ sort matched Rules by priority then Rule ID
→ flatten matched Rule Effects in declared order
→ validate the complete Effect plan
→ atomically commit run, items, event, pending turn, and revision
→ project new state
```

Rules never observe Effects emitted by another Rule in the same transaction;
there is no recursive or fixpoint evaluation. Action item mutations are visible
to every Rule in that transaction, while Rule item mutations do not trigger a
second evaluation.

At most one `changeStage` may appear across the Action and all matched Rules.
More than one aborts the entire transaction. `addMetric` accumulates; later
`setFlag`, `setItemState`, and `setAppearanceOverride` writes replace earlier
writes to the same target. Any planning, validation, revision, or limit failure
leaves run state, item state, pending turns, events, and revision unchanged.

### Progress and terminal semantics

V2 Stage progress is metric-backed authoring data:

```ts
interface MetricProgressBinding {
  id: string
  label: string
  source: { fact: "metric"; id: string }
  max?: number
}
```

The current-stage projection reads the metric and emits the stable
`{ id, label, value, max? }` shape. A positive finite `max` is optional. V1
stored `{ value }` progress remains readable only for backward compatibility.

`terminal: true` ends the run regardless of `completionMode`. Terminal Stages
have no prepared Actions or agent fallback. Entering one through the sole
`changeStage` atomically sets `run.status = "completed"`; completed runs reject
further Actions without changing revision or history. `completionMode` controls
authoring graph validation, not terminal execution. There is no `completeRun`
Effect.

### Interaction paths

1. **Hot:** a prepared choice executes locally.
2. **Warm:** normalized free text matches exactly one prepared phrase and
   executes locally.
3. **Cold:** unmatched input at an explicit fallback Stage creates a persisted
   agent-turn request.

Cold-path requests use expected revisions and idempotency. Resolution dialogue,
Effects, item mutations, progress event, and pending-turn status commit
atomically. Without WebMCP, the request remains pending and local play continues
where possible.

## Consequences

- New experiences and Loop compositions are primarily validated data.
- Hot and warm interactions remain deterministic, local, and inspectable.
- Agent improvisation stays available without becoming a per-turn dependency.
- Time semantics, shared memory, dialogue graphs, and new Effect kinds remain
  explicit future work rather than implied runtime support.
- Hidden Playbook content improves presentation but is not confidential on a
  user-owned local device.
