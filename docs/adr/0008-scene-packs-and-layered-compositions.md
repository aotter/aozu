# ADR-0008: Render Versioned Scene Packs as Layered Compositions

- Status: Accepted
- Date: 2026-08-31

## Context

Stages previously had only an informal background concept. A single opaque
image cannot place environmental elements both behind and in front of a
character, and unvalidated asset references can make an otherwise valid bundle
fail only at render time.

Scene resources must work for shipped Starters, agent-completed candidates, and
portable imports through the same deterministic and offline-safe path.

## Decision

A Scene Pack is a versioned collection of `SceneAsset` records and
`SceneComposition` definitions. Starter packages qualify available
compositions with Scene Pack ID and version during authoring; resolved runtime
entries use globally unique composition and asset IDs within the bundle
namespace.

The initial scene canvas is `512 × 768`. Assets may be PNG, JPEG, or WebP and
record media type, exact dimensions, byte size, and SHA-256 digest. Validation
checks the byte signature, decoded dimensions, recorded metadata, and digest.
SVG, video, remote URLs, runtime resizing, and automatic repair are outside the
initial profile.

A composition contains one to 32 layers. Each layer has a unique ID, references
an existing scene asset, selects the `back` or `front` plane, and declares a
unique integer order within that plane. Resolution sorts by plane, order, then
ID. The renderer always places layers in this sequence:

```text
back scene layers
→ character composition
→ front scene layers
```

A stage stores `scene.compositionId` and may store
`scene.characterStateId`. Both references must resolve to published entries in
the candidate namespace. Runtime loading rejects draft, archived, missing, or
mis-typed scene assets and compositions rather than rendering them as a
fallback. Character state selection likewise resolves the matching validated
Character Pack instead of silently choosing another pack.

Starter validation resolves every composition before selection. Candidate
validation restricts authored stage bindings to the selected package's
available character states and scene compositions. Portable import repeats
asset and composition validation and requires every referenced stage resource
to be present and published.

Scene assets are embedded into the resolved bundle asset namespace and portable
exports. Runtime rendering therefore remains offline and independent of the
Starter's source location.

This ADR owns the scene details first summarized in ADR-0001; it does not change
that ADR's stable `StageProjection` boundary.

## Consequences

- One-layer backgrounds and foreground occlusion share one model.
- Rendering order is deterministic across Starter loading, runtime, and import.
- WebP can reduce shipped scene size while character rig layers remain strict
  RGBA PNG under ADR-0005.
- Exact-canvas assets trade flexibility for predictable validation and simple
  composition.
- Transforms, parallax, animation, multiple canvases, and remote rehydration
  require later decisions rather than optional fields in this contract.
