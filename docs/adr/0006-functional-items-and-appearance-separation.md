# ADR-0006: Give Items Gameplay Affordances Without Coupling Function to Artwork

- Status: Accepted
- Date: 2026-08-30

## Context

Clothing, accessories, and props should affect more than character rendering.
They can unlock actions, satisfy conditions, consume resources, change dialogue,
and participate in Progress Loops. Treating them as decorative PNG files would
leave that gameplay potential unused.

Putting mechanics directly in artwork creates different problems. A player may
be forced to wear an unwanted style for its stats, a paid artist pack may become
pay-to-win, and installing an otherwise visual pack may silently inject rules.
Function must also survive when a user changes art style or substitutes another
compatible appearance.

ADR-0004 already defines a closed Condition and Effect runtime. ADR-0005 defines
rig profiles and visual character packs. Functional items must reuse those
contracts instead of introducing executable item scripts or another rules
engine.

## Decision

### Separate appearance from function

Companion models four related but distinct concepts:

```text
Appearance  — how an item is rendered
Item        — what the player owns
Affordance  — what the item permits
Rule/Effect — when and how state changes
```

An item may provide a default appearance, but its gameplay identity is not an
image asset. Character equipment and rendered appearance are separate state:

```ts
interface CharacterLoadout {
  equipment: Readonly<Record<string, string | null>>
  appearanceOverrides: Readonly<Record<string, AppearanceRef | null>>
}
```

Equipping an item uses its default appearance unless the player has selected an
override compatible with the active rig profile. Removing or changing that
override does not remove the item's gameplay function.

Rules that depend on a visible disguise, uniform, or style must explicitly read
appearance facts. Rules that depend on mechanical equipment read item or
capability facts. The two are not interchangeable.

### Item definition and inventory state

An immutable item definition is Playbook data under the fixed Mantle backbone:

```ts
interface ItemDefinition {
  id: string
  name: string
  equipSlot?: string
  defaultAppearance?: AppearanceRef
  grants?: readonly string[]
  actionIds?: readonly string[]
  ruleIds?: readonly string[]
  stackable?: boolean
  maxQuantity?: number
  stateSchema?: JsonSchema
}
```

The player's inventory stores instances or stack state separately:

```ts
interface InventoryItemData {
  definitionId: string
  quantity: number
  state: Record<string, unknown>
}
```

`stateSchema` validates item-specific state such as charges, durability, upgrade
level, acquisition context, or a linked memory. Mantle's entry envelope supplies
the instance ID and optimistic version.

### Initial affordance model

The first version supports four composable mechanisms:

1. **Capability grants** make declared facts such as `explore.in-rain` or
   `social.formal-attire` available while an item is equipped.
2. **Action grants** add validated actions such as taking a photograph, using a
   ticket, or starting an outdoor run to the current-stage projection.
3. **Rule participation** lets existing Gameplay Rules react to item ownership,
   equipment, appearance tags, state, or use.
4. **Consumable state** changes quantity or declared item state through trusted
   Procedures and the closed Effect vocabulary.

The Condition fact vocabulary adds only versioned item facts required by these
mechanisms, including inventory ownership, equipped item, granted capability,
appearance tag, quantity, and schema-declared item state.

The Effect vocabulary adds only versioned operations required to grant,
consume, equip, unequip, and update declared item state. Agent-authored code and
arbitrary formulas are not item effects.

Item actions execute through the same deterministic ordering, limits,
expected-revision checks, idempotency, and all-or-nothing action transaction
defined by ADR-0004. Inventory changes are recorded as progress events; balances
and loadouts remain deterministic projections.

### Pack trust boundary

A Character Pack from ADR-0005 is visual by default. It may provide assets,
layer compositions, display metadata, semantic appearance tags, attribution,
and license information. Installing it does not install metrics, rewards,
Gameplay Rules, actions, Procedures, or hidden effects.

Purpose Templates and agent-authored Playbooks bind visual appearances to
functional item definitions. A separately distributed package that includes
mechanics is an Experience Pack and must pass the complete Mantle and Companion
validation pipeline from ADR-0002.

Paid artwork does not gain gameplay advantages merely because it is paid. A
functional item may use an open, paid, imported, or agent-generated appearance
without changing its mechanics.

### Validation

Candidate item definitions must satisfy all of the following:

- referenced appearances, slots, actions, rules, metrics, stages, and assets
  exist;
- an appearance matches the active rig profile and declared equipment slot;
- capabilities, facts, conditions, and effects belong to the versioned closed
  vocabulary;
- quantity, charge, durability, and limit fields cannot enter invalid negative
  or non-finite states;
- item state conforms to its declared JSON Schema;
- use, equip, and consume operations cannot bypass expected revisions or action
  transaction limits;
- installing a Character Pack alone cannot change gameplay state or register
  mechanics.

Invalid agent-authored item data is rejected with diagnostics. The runtime does
not repair definitions or infer executable behavior from appearance tags.

### Deliberate initial limits

The initial model does not include arbitrary stat formulas, percentage-modifier
stacking, random affixes, rarity tiers, procedural loot, scriptable items, or a
general equipment-balance system. These require separate evidence and decisions.

The same affordance model may later apply to scene objects, locations, or other
entities, but the first implementation is limited to inventory and equipped
items.

## Consequences

- Clothing and props can change available play instead of being cosmetic-only.
- Players can choose their preferred visual style without sacrificing a
  functional loadout.
- Visual artists can publish packs without becoming trusted gameplay authors.
- Purpose Templates can reuse one functional item across compatible art styles.
- The current Condition and Effect runtime gains a small item vocabulary rather
  than a second rules engine.
- Appearance-dependent narrative remains possible, but rules must request it
  explicitly instead of accidentally inheriting equipment mechanics.
- Rich randomized equipment systems remain possible future extensions rather
  than requirements imposed on every domain application.
