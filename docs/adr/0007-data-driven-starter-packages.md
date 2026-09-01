# ADR-0007: Author Experiences from Data-Driven Starter Packages

- Status: Accepted
- Date: 2026-08-31

## Context

The first authoring proof of concept placed an executable experience fixture in
TypeScript. That made a content choice behave like product logic, caused
character creation to manufacture an unrelated Playbook, and made adding a new
starting point require an application release. The fixture was not an approved
product requirement and must not survive as sample content, fallback behavior,
or migration data.

A Starter needs curated visuals and a complete default Playbook so the primary
creation flow works without an agent. An agent may customize that same draft,
but WebMCP availability cannot decide whether a user can create a Companion.

Authoring state must also respect the Mantle boundary. React and WebMCP adapters
must not write IndexedDB records themselves. Mutating commands enter through a
versioned Mantle Trigger and Procedure; storage details remain behind Mantle's
semantic adapter and trusted handlers.

## Decision

### Static package contract

A Starter is an immutable, versioned static content package. Its canonical
contract is independent of ZIP or any other distribution container. A package
contains:

- identity, version, compatibility, name, and description;
- declared asset files with media types;
- one validated Character Pack and named character states;
- one validated Scene Pack and named scene compositions;
- one or more Directions, each with a resolved `ExperienceSeed` and validated
  default Playbook;
- Playbook skeleton requirements and authoring instructions used to validate
  both the packaged default and optional agent customization.

The application owns one generic parser, loader, and validator. Package names,
Direction recipes, Progress Loop IDs, briefs, skeleton requirements, visual
references, and assets live under the data-driven static catalog. Adding or
changing a package does not require a TypeScript registration or
Starter-specific branch.

Static packaging is a source boundary, not a trust shortcut. The loader checks
same-origin paths, package and catalog versions, compatibility, unique IDs,
asset completeness, byte digests, raster dimensions and formats, Character
Pack composition, Scene Pack composition, Direction references, and skeleton
shape before presenting the package.

### Draft and Mantle command boundary

Selecting a package and Direction invokes the fixed
`select-experience-draft` Mantle Trigger. Its builtin Procedure creates an
operational `experience-drafts` entry containing the package identity and
version, a canonical manifest SHA-256, Direction and resolved seed snapshot,
selected character and scene references, and revision zero. The executable
default remains in the immutable package rather than being copied into mutable
draft state. The digest makes content changes under an unchanged package
version a hard failure. The newest created draft is the selected draft; older
drafts cannot be submitted after a newer selection.

`inspect_experience_contract` is read-only. It reads the selected draft through
the prepared Mantle runtime and returns the exact revision, package resources,
skeleton, closed condition/effect vocabulary, and validation limits.

`submit_experience_candidate` is projected from the
`submit-experience-candidate` Mantle Procedure and Trigger. Its structured
candidate input is the manifest contract directly; the browser adapter does not
serialize it into a second JSON-string contract. The trusted Procedure handler:

1. loads the selected Mantle draft and the exact package version;
2. treats a prior successful idempotency key as a replay;
3. validates the complete declarative candidate and package assets;
4. assembles the locked fixed backbone and resolved entries;
5. asks one trusted storage port to atomically stage the inactive bundle,
   entries, and assets and advance the draft revision.

The atomic port is infrastructure used only by that Trigger handler. UI and
WebMCP code cannot call it. A stale revision, unselected draft, invalid
candidate, or storage failure changes neither the active bundle nor a partial
candidate namespace.

The agent may author only declared Playbook data: name, initial metrics and
flags, item definitions, stages, narrative, prepared actions and phrases,
rules, visual bindings, terminal points, and persisted agent fallbacks. It
cannot replace assets, fixed manifests, handler bindings, or application code.

`create-local-companion` is a non-public Mantle Trigger used by the normal UI.
It resolves the selected package Playbook, or an intentionally taskless shell
for Blank Story, then enters the same assembly, semantic validation, atomic
storage, and activation path. The `/create` page is the user's review surface,
so this path does not add a second candidate review step.

### Validation and activation

Candidate validation retains ADR-0002's semantic gates and makes them concrete:

- unique IDs and unambiguous normalized phrases;
- existing initial stage, complete reachability, and valid action/rule
  transition targets;
- a local action or explicit agent fallback on every non-terminal stage;
- a reachable terminal and no closed component for finite experiences;
- closed, strictly shaped conditions and effects within versioned limits;
- declared metrics, flags, item definitions, inventory IDs, actions,
  appearances, character states, scene compositions, and assets;
- Entry validation against the compiled fixed backbone.

A successful submission creates an inactive candidate. Preview shows Starter,
Direction, Progress Loops, completion mode, rendered character and scene,
initial narrative, stage count, and fallback count. Only the preview's explicit
user action may move the active bundle pointer.

The resolved bundle records the Starter ID/version, Direction, and complete
Experience Seed plus the source manifest digest in metadata. Portable
export/import already carries this metadata together with the resolved
manifests, entries, and assets, so runtime does not depend on the original
package remaining installed.

Character authoring validates and explicitly saves reusable Character Pack
data. It does not synthesize a Playbook or activate a Companion. Incorporating
that pack into an experience remains a later authoring selection concern.

### Compatibility with earlier decisions

This ADR supersedes ADR-0002's executable “Purpose Template” layer while
retaining its fixed-backbone and semantic-validation decisions. The legacy
`BundleIdentity.templateId/templateVersion` fields carry Starter ID/version
until a bundle-contract migration justifies renaming them.

It also supersedes ADR-0005's statement that approving a standalone Character
Pack activates a Companion. Visual validation remains unchanged; activation is
only meaningful for a complete resolved experience.

## Consequences

- Content packages can be added and revised independently of application code.
- Every Story Direction has an explicit, inspectable default Playbook; Blank
  Story creates no story or tasks.
- The authoring flow remains durable and revision-safe without exposing
  IndexedDB as an application API.
- Package authors must bump versions when immutable package content changes.
- An inactive candidate may remain unused if the user declines approval; it is
  safe because it cannot affect the active pointer.
- Remote registries, ZIP as a required authoring format, and a general visual
  workflow editor remain out of scope.
