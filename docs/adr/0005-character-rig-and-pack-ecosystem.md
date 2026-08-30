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
style. They may require named rig slots such as expressions or props, and pack
validation verifies that the selected rig supplies them. Runtime progress,
dialogue, rules, and memories refer to a character composition or visual state
through stable qualified IDs.

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
    alpha: "required" | "opaque" | "either"
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

Rig version 2 inserts `expression-head` between `character-skin` and
`item-front`. An expression is a full-canvas transparent layer containing the
complete aligned head, not cropped facial features. Hair and facial hair are
fixed identity pixels repeated consistently in body skins and head-expression
layers; they are not separate v2 customization slots.

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
    url?: string
    embedding: "allowed"
  }
  assets: CharacterAsset[]
  appearances: CharacterAppearance[]
  defaultComposition: CharacterComposition
}
```

One logical appearance item may contain multiple layer assets in different
slots. A hat, hairstyle, outfit, expression, or prop is therefore not assumed
to be one PNG.

`CharacterComposition` stores qualified appearance references, not copied image
data. Every reference contains `packId`, `packVersion`, and `appearanceId`;
asset references are qualified the same way. This prevents collisions when two
packs use the same local IDs.

A pack's `defaultComposition` is self-contained: it references appearances in
that pack, and each v1 appearance owns layers backed by assets in that pack.
Cross-pack mixing belongs to the active character composition, which resolves
qualified appearances from all installed packs that declare the same rig
profile and version. This keeps an individual pack independently valid without
preventing wardrobe combinations.

A composition resolves to an ordered layer list under the selected rig profile.
Items from different packs may be combined only when they declare the same rig
profile and version. Rig slot orders must be unique. Each appearance layer also
declares an order within its slot, and final rendering sorts by slot order,
layer order, then qualified asset ID. Duplicate slot or layer orders are
rejected rather than relying on manifest insertion order.

### Sources and activation

Character creation supports four equivalent candidate sources:

- a bundled preset pack;
- an installed artist pack;
- an imported pack;
- an agent-generated pack prepared outside the website.

Selecting a bundled preset creates an editable authoring seed; it does not
activate an immutable finished character. The seed may be changed before it is
validated and staged. Import sources may stage immediately after validation,
but remain inactive until review.

All sources use the same activation path:

```text
candidate
→ editable draft when the source is authoring-capable
→ structural and asset validation
→ rendered preview
→ explicit user approval
→ activation
```

Validation requires:

- a valid and supported rig profile;
- unique pack, appearance, item, and asset IDs;
- a complete default composition;
- pack-local default appearance and asset references, plus qualified references
  in an active cross-pack composition;
- only declared layer slots;
- deterministic and unique slot and layer ordering;
- every referenced asset to exist and match its recorded digest;
- exact canvas dimensions for every raster layer;
- supported media types and the rig slot's alpha policy: `required` has at least
  one non-opaque pixel, `opaque` has none, and `either` accepts both;
- creator and license URLs, when present, to use `https`; private local
  authoring may use a `private-use` declaration without an external URL;
- archive paths and sizes within the browser import profile from ADR-0003.

An invalid pack is rejected with diagnostics for its producer. The website does
not repair candidate artwork.

### Persistence and distribution

Raster data remains in the IndexedDB Blob asset store established by ADR-0003.
Mantle entries store qualified pack, composition, appearance, and asset IDs
rather than base64 image data.

The initial browser profile embeds every selected pack manifest and asset into
the resolved experience bundle namespace. Pack activation therefore uses the
same candidate validation and atomic `activeBundleId` pointer swap as ADR-0003;
there is no independent active-pack pointer or cleanup race. ZIP export remains
self-contained and offline restoration never depends on a pack registry.

Pack licensing is independent of the framework's software license. A pack must
identify its creator, license or private-use declaration, attribution, and an explicit machine-readable
declaration that embedding is allowed. Initial imports reject packs without
that declaration.

The machine-readable license block is a routing and presentation aid. The
website presents it but does not interpret arbitrary legal terms. The linked
license text remains authoritative.

Reference-only packs, entitlement providers, and remote rehydration are outside
the initial browser profile. They require a later ADR because they would change
the self-contained export and offline recovery contract.

## Consequences

- Art style can vary without forking progress, story, or persistence code.
- Artists can target an existing rig profile and publish compatible base packs
  or expansions.
- Agent-generated and human-authored packs pass the same trust boundary.
- Full-canvas layers use more storage than cropped and transformed sprites, but
  preserve the alignment and deterministic renderer already proven by the POC.
- Assets are not assumed to mix across rig profiles or profile versions.
- Cross-pack compositions remain deterministic because all references are
  qualified and all selected assets are embedded in the resolved bundle.
- Bone animation, arbitrary transforms, automatic recoloring, and cross-profile
  conversion remain outside the initial renderer.
