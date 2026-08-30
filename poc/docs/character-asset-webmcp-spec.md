# Character Asset WebMCP Spec

## Outcome

Companion exposes a constrained character-asset workflow through WebMCP. An
agent can create stable candidates for expressions, outfits, and props, but cannot
write arbitrary files, overwrite the active character, skip validation, approve its
own work, or create an illegal equipment combination.

The MVP proves one complete path:

```text
canonical reference
  → constrained asset job
  → image generation
  → candidate bundle import
  → deterministic validation
  → human preview and approval
  → activation
  → expression/outfit/item change
  → reload and ZIP round-trip
```

## Scope

- One character pack with a fixed 512×768 canvas and front-facing standing pose.
- Outfits are complete character skin sets.
- Expressions are complete skin variants within an outfit.
- Props are one or two full-canvas transparent overlay layers.
- IndexedDB is the runtime store; `.zip` is the portable companion format.
- Only `document.modelContext` is supported.
- There is no image-generator compatibility or background-removal adapter inside
  the website. The agent may preprocess generated files before import.

Not in the MVP: arbitrary poses, Live2D, skeleton animation, cropped props, freeform
image generation, automatic visual approval, or a full Picrew-style creator UI.

## Non-Negotiable Decisions

1. **Part, Item, and Layer are different concepts.** A headwear item may own a back
   and front layer.
2. **Generation is workflow-specific.** There is no `generate_any_image` tool.
3. **Every variant starts from the canonical reference.** Never generate from the
   previous generated variant.
4. **Generated output is a candidate.** Only a validated, human-approved candidate
   can become active.
5. **Outfit and prop pipelines differ.** Outfits replace the complete skin; props
   remain fixed-canvas overlays.
6. **Runtime rules preserve invariants.** Agent instructions are not relied upon to
   prevent conflicts, missing required parts, or empty fallbacks.

These decisions follow the supplied Picrew/Layer research and the official
[WebMCP proposal](https://github.com/webmachinelearning/webmcp).

## Asset State Machine

```text
proposed → exported → imported → validating → valid → reviewing
                                                   ├→ rejected
                                                   └→ approved → activated

Any deterministic validation failure → invalid
```

Only these transitions are legal:

| From | To | Authority |
| --- | --- | --- |
| none | proposed | agent through a constrained tool |
| proposed | exported | runtime |
| exported/proposed | imported | user or browser file upload |
| imported | valid/invalid | runtime validator |
| valid | approved/rejected | user click inside pending WebMCP execution |
| approved | activated | agent tool; runtime rechecks state |

The agent cannot supply `status`, `approvedAt`, or `active` fields.

## Character Contract

```ts
type CharacterContract = {
  canvas: { width: 512; height: 768 }
  pose: 'fullbody-front-v1'
  footBaseline: 736
  centerX: 256
  silhouetteBounds: [number, number, number, number]
  requiredExpressions: ['neutral', 'happy']
  renderOrder: [
    'background',
    'item-back',
    'character-skin',
    'item-front',
    'aura',
    'foreground',
  ]
  preserve: [
    'identity',
    'face',
    'bodyProportions',
    'pose',
    'cameraDistance',
    'lineStyle',
    'lightingDirection',
  ]
}
```

The current `momo-canonical-01.png` remains a candidate until review. Activating a
different canonical creates a new pack version rather than mutating an existing pack.

## Character Pack

```ts
type CharacterPack = {
  id: string
  version: number
  contract: CharacterContract
  identity: {
    canonicalAsset: string
    canonicalSha256: string
  }
  outfits: Record<
    string,
    {
      label: string
      variants: Record<string, string> // expression id → full-skin asset path
      fallbackExpression: 'neutral'
    }
  >
  parts: Record<
    string,
    {
      required?: boolean
      fallbackItem?: string
      maxEquipped: number
    }
  >
  items: Record<string, CharacterItem>
  state: {
    activeOutfit: string
    activeExpression: string
    equippedItemIds: string[]
    revision: number
  }
}

type CharacterItem = {
  id: string
  part: 'headwear' | 'hand' | 'back' | 'aura'
  layers: Array<{
    id: string
    asset: string
    placement: 'item-back' | 'item-front' | 'aura'
    z: number
  }>
  conflictsWith: string[]
  requires: string[]
  replaces: string[]
}
```

### Outfit And Expression Rule

An outfit is a skin set, not an overlay. `activeOutfit + activeExpression` resolves
to one complete skin. If persisted state references a missing expression, startup uses
the outfit's `neutral` fallback. An explicit request for an unavailable expression is
rejected rather than silently changed.

This avoids fragile face overlays while making the expression/outfit cross-product
explicit and bounded.

## Asset Jobs

```ts
type AssetWorkflow =
  | 'canonical-character'
  | 'expression-variant'
  | 'outfit-skin'
  | 'wearable-prop'

type AssetJob = {
  id: string
  packId: string
  workflow: AssetWorkflow
  prompt: string
  sourceCanonicalSha256: string
  target?: {
    outfitId?: string
    expressionId?: string
    part?: CharacterItem['part']
  }
  constraints: {
    canvas: [512, 768]
    pose: 'fullbody-front-v1'
    preserve: CharacterContract['preserve']
    transparentBackground: true
    outputLayers: Array<'skin' | 'back' | 'front' | 'aura'>
  }
  candidateCount: 1 | 2 | 3 | 4
  status: 'proposed' | 'exported' | 'imported' | 'validating' | 'valid' | 'invalid' | 'reviewing' | 'approved' | 'rejected' | 'activated'
}
```

### Workflow Outputs

| Workflow | Required output |
| --- | --- |
| `canonical-character` | one complete neutral full-body skin |
| `expression-variant` | one complete skin for one outfit/expression pair |
| `outfit-skin` | one complete neutral skin; required expressions become follow-up jobs |
| `wearable-prop` | one or two full-canvas transparent overlay layers |

Every generation brief includes the canonical image, contract, exact output list,
preserve invariants, and negative constraints. It never contains a raw unconstrained
prompt alone.

## WebMCP Tools

Every result uses this envelope so the agent knows what to do next:

```ts
type ToolResult<T> = {
  status: 'ok' | 'needs-user' | 'invalid' | 'conflict'
  revision: number
  data: T
  nextActions: Array<{
    tool: string
    required: boolean
    reason: string
  }>
}
```

### Read Tools

#### `inspect_character_contract()`

Always called before character asset work. Returns the contract, canonical reference,
supported workflows, active state, part limits, and generation constraints.

#### `inspect_character_state()`

Returns active outfit, expression, equipped items, resolved render layers, points, and
revision. It does not return candidate binary data.

#### `list_asset_jobs({ status? })`

Returns resumable jobs and candidates. The agent uses this after a timeout, reload, or
fresh chat instead of creating duplicates.

### Generation Lifecycle Tools

#### `propose_asset_job({ workflow, prompt, target, candidateCount })`

Validates that the requested workflow and target exist, locks the canonical hash, creates
the job, and returns a production prompt plus expected candidate manifest. It cannot
activate anything.

#### `export_asset_job_bundle({ jobId })`

Creates a ZIP download containing:

```text
job.json
reference/canonical.png
reference/contract.json
candidate-template.json
```

The host agent uses its own image-generation capability. The web page does not receive
or store model credentials. Before packaging a candidate, the agent preprocesses generated
assets outside the website: remove the background, place each asset on the exact 512×768
canvas without changing alignment, and verify genuine RGBA alpha. Only final assets are
submitted. This preflight saves batch quota but never replaces the browser's independent
validation; the website validates but never repairs candidate images.

#### `request_candidate_import({ jobId })`

Returns a pending Promise and shows a standard `<input type="file" accept=".zip">`.
The user or browser agent uploads a candidate bundle. This is the MVP transport because
WebMCP binary inputs remain unsuitable for large image payloads. No directory picker is
used.

Candidate ZIP:

```text
candidate.json
assets/<declared-layer-id>.png
```

The runtime rejects undeclared paths, missing files, extra files, duplicate IDs, and hash
mismatches before writing Blobs to IndexedDB.

#### `validate_asset_candidate({ candidateId })`

Runs deterministic checks and records the report. It cannot approve. Invalid output is
reported and regenerated from the locked canonical: use any remaining slot in the current
2–4 candidate batch, or propose a fresh batch after all slots fail.

#### `review_asset_candidate({ candidateId })`

Displays canonical and candidate previews on the fixed canvas. Its Promise resolves only
after the user chooses Approve or Reject. Approval is written by the click handler, not
accepted as a tool argument.

#### `activate_asset_candidate({ candidateId })`

Requires `valid + approved`, checks the locked canonical hash again, adds the skin,
expression, or item to the pack, and appends an activation event. It cannot overwrite an
existing active ID; replacement requires a new job/version.

### Runtime Tools

#### `set_character_outfit({ outfitId })`

Requires an activated outfit with a neutral variant. Preserves the selected expression
when available; otherwise resolves to neutral and reports that resolution.

#### `set_character_expression({ expressionId })`

Requires the active outfit to contain that expression. No image generation occurs.

#### `equip_character_item({ itemId })`

Runs the equipment algorithm below and commits state plus journal in one transaction.

#### `unequip_character_item({ itemId })`

Refuses to leave a required part empty; inserts its fallback item atomically when needed.

### Tools That Must Not Exist

```text
generate_any_image
write_any_asset
overwrite_active_character
set_character_state
skip_asset_validation
approve_asset_candidate_as_agent
```

## Equipment Algorithm

For a proposed equip operation:

1. Load the item, current state, and matching part.
2. Reject inactive or unknown items.
3. Remove items named by `replaces` from a tentative state.
4. Reject `conflictsWith` in either direction.
5. Verify every `requires` part/item.
6. Enforce `maxEquipped` for the target part.
7. Add the item.
8. Fill any empty required part with `fallbackItem`.
9. Resolve render layers and reject duplicate layer IDs or illegal z values.
10. Commit state and an append-only journal event in one IndexedDB transaction.

No partial equipment state is ever visible.

## Validation

### Deterministic Gates

| Check | Skin/expression/outfit | Prop layer |
| --- | --- | --- |
| dimensions | exactly 512×768 | exactly 512×768 |
| format | PNG or WebP | PNG or WebP |
| max bytes | 5 MiB each | 5 MiB each |
| alpha channel | required | required |
| layer count | exactly 1 per variant | 1–2 according to job |
| foot baseline | within ±4 px | not applicable |
| center X | within ±8 px | contract-relative bounds |
| canonical hash | must match job | must match job |
| manifest/files | exact set, no extras | exact set, no extras |

The browser calculates SHA-256 with `crypto.subtle.digest` and non-transparent bounds
from canvas pixel data.

### Advisory Visual Gates

The agent compares the candidate against the canonical for face, proportions, pose,
camera, line style, and lighting. That report is advisory and visibly labeled as such.
Only the user's review can approve identity.

## Renderer

One fixed 512×768 relative container holds full-canvas absolutely positioned images:

```text
background
item-back layers sorted by z
resolved outfit/expression skin
item-front layers sorted by z
aura layers sorted by z
foreground
```

All images use the same canvas, `inset: 0`, `width: 100%`, and `height: 100%`.
The renderer never guesses crop offsets or scales individual props.

## IndexedDB And ZIP

The existing stores remain sufficient for the MVP:

- `meta`: companion manifest, character pack, jobs, candidates, validation reports.
- `files`: canonical, candidate, active skin, and item layer Blobs keyed by path.
- `journals`: append-only character lifecycle and equipment events.

Portable ZIP target:

```text
manifest.json
character/pack.json
character/state.json
character/jobs/<job-id>.json
character/candidates/<candidate-id>/candidate.json
assets/reference/canonical.png
assets/skins/<outfit-id>/<expression-id>.png
assets/items/<item-id>/<layer-id>.png
journal/YYYY-MM-DD.md
```

Import hydrates a temporary snapshot, validates every referenced path/hash/rule, then
replaces the live companion in one transaction. Invalid imports never partially mutate the
current companion.

## Journal Events

```text
asset_job_proposed
asset_candidate_imported
asset_candidate_validated
asset_candidate_approved
asset_candidate_rejected
asset_candidate_activated
character_outfit_changed
character_expression_changed
character_item_equipped
character_item_unequipped
```

Every event has a unique ID, timestamp, actor, source job/candidate IDs, and resulting
revision. Activation and equipment events include the resolved asset paths.

## Minimal File Changes

```text
src/character.ts             contracts, state machine, rules, validation
src/CharacterRenderer.tsx    fixed-canvas layered renderer
src/companion.ts                 IndexedDB transactions and ZIP serialization
src/App.tsx                  WebMCP registration and pending review/import UI
public/assets/character/     development-only seeded candidates
```

Do not create a framework, service layer, repository interface, or plugin system. Split
further only when these files become difficult to navigate.

## Verification Scenario

1. Inspect the character contract.
2. Activate one approved canonical candidate.
3. Create and activate `happy` from the canonical.
4. Create and activate one outfit neutral skin from the same canonical.
5. Switch expression on default outfit; verify missing outfit expression is rejected or
   resolves to neutral only during recovery.
6. Create a two-layer hat with back/front assets.
7. Equip it; verify z ordering and `maxEquipped`.
8. Attempt a conflicting hat; verify the transaction fails without changing state.
9. Reload; verify the same resolved layers.
10. Export ZIP, clear IndexedDB, import ZIP, and compare manifest, hashes, state, and
    rendered layer list.

## Implementation Order

1. Character contracts, state machine, and rule self-check.
2. IndexedDB/ZIP representation and atomic mutations.
3. Fixed-canvas renderer with the existing canonical candidate.
4. Read tools and runtime outfit/expression/equipment tools.
5. Asset job, import, deterministic validation, and human review tools.
6. One expression, one outfit, and one two-layer prop vertical slice.
