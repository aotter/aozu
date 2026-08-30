# ADR-0005: Separate Visual Rigs and Character Packs from Experience Mechanics

- Status: Accepted
- Date: 2026-08-30

## Context

Visual style strongly influences whether a player adopts a character-based
experience. One fixed house style would exclude players who prefer pixel art,
anime illustration, western cartoons, animals, monsters, or other forms. The
framework must also support preset packs, agent-generated characters, imported
packs, and packs supplied by professional artists.

Visual choices and experience mechanics vary independently. A fitness,
relationship, or narrative template must not require one art style, and one
character pack must be reusable across compatible purpose templates.

The proof of concept validated deterministic composition from exact-size RGBA
layers, including an item represented by multiple layers placed before and
after the character. It also established a strict candidate, validation,
preview, approval, and activation flow. The website validates final assets but
does not remove backgrounds, resize images, repair alignment, or adapt arbitrary
generator output.

## Decision

### Orthogonal selection axes

Character creation combines two independent selections:

```text
Experience Template / Progress Loops
× Character Rig / Character Pack
= Playable Experience
```

Purpose templates may recommend a visual pack but cannot depend on its art
style. Runtime progress, dialogue, rules, and memories refer to a character
composition or visual state through stable IDs.

### Rig profile

A versioned rig profile defines the rendering contract shared by compatible
packs:

```ts
interface CharacterRigProfile {
  id: string
  version: number
  canvas: {
    width: number
    height: number
  }
  slots: Array<{
    id: string
    order: number
    required?: boolean
  }>
}
```

The initial profile uses the proof-of-concept `512 × 768` canvas. That size is
not a platform-wide constant: another profile may declare another canvas and
slot order.

Initial rendering uses exact-canvas RGBA layers with no runtime scaling,
repositioning, bone rigging, or attachment-anchor system. A layer is compatible
only when its dimensions and slot match the selected profile. A later ADR may
add another rendering model without changing the first profile.

### Character pack

A pack is a versioned set of visual assets and composition definitions for one
rig profile:

```ts
interface CharacterPack {
  id: string
  version: number
  rigProfile: {
    id: string
    version: number
  }
  creator: {
    name: string
    url?: string
    attribution?: string
  }
  license: {
    id: string
    url: string
    distribution: "embedded" | "reference-only"
  }
  assets: CharacterAsset[]
  appearances: CharacterAppearance[]
  defaultComposition: CharacterComposition
}
```

One logical appearance item may contain multiple layer assets in different
slots. A hat, hairstyle, outfit, expression, or prop is therefore not assumed
to be one PNG.

`CharacterComposition` stores selected appearance IDs, not copied image data.
It resolves to an ordered layer list under the pack's rig profile. Items from
different packs may be combined only when they declare the same rig profile and
version.

### Sources and activation

Character creation supports four equivalent candidate sources:

- a bundled preset pack;
- an installed artist pack;
- an imported pack;
- an agent-generated pack prepared outside the website.

All sources use the same activation path:

```text
candidate
→ structural and asset validation
→ rendered preview
→ explicit user approval
→ activation
```

Validation requires:

- a valid and supported rig profile;
- unique pack, appearance, item, and asset IDs;
- a complete default composition;
- only declared layer slots;
- deterministic slot ordering;
- every referenced asset to exist and match its recorded digest;
- exact canvas dimensions for every raster layer;
- supported media types and genuine RGBA alpha where transparency is required;
- archive paths and sizes within the browser import profile from ADR-0003.

An invalid pack is rejected with diagnostics for its producer. The website does
not repair candidate artwork.

### Persistence and distribution

Raster data remains in the IndexedDB Blob asset store established by ADR-0003.
Mantle entries store pack, composition, appearance, and asset IDs rather than
base64 image data.

Pack licensing is independent of the framework's software license. A pack must
identify its creator, license URL, attribution, and distribution mode.

- `embedded` assets may be included in a self-contained bundle export.
- `reference-only` assets export the pack ID, exact version, composition, and
  integrity information but not reusable source layers. Rehydration requires
  the same pack to be installed or obtained through its entitlement provider.

The machine-readable license block is a routing and presentation aid. The
linked license text remains authoritative.

## Consequences

- Art style can vary without forking progress, story, or persistence code.
- Artists can target an existing rig profile and publish compatible base packs
  or expansions.
- Agent-generated and human-authored packs pass the same trust boundary.
- Full-canvas layers use more storage than cropped and transformed sprites, but
  preserve the alignment and deterministic renderer already proven by the POC.
- Assets are not assumed to mix across rig profiles or profile versions.
- Commercial packs can preserve user state portability without redistributing
  reusable source artwork.
- Bone animation, arbitrary transforms, automatic recoloring, and cross-profile
  conversion remain outside the initial renderer.
