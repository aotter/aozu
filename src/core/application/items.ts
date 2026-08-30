import { jsonSchemaToZod } from '@aotter/mantle-spec'
import type { EntryReader } from '@aotter/mantle-runtime'

import type { CharacterLoadout, InventoryItem, ItemDefinition, ItemEffect, LoadoutProjection } from '../domain/items.ts'
import type { AppearanceRef } from '../domain/character.ts'
import type { ActionRepository } from './ports.ts'

const idPattern = /^[a-z0-9][a-z0-9_-]{0,80}$/
const refKey = (value: import('../domain/character.ts').AppearanceRef) => `${value.packId}@${value.packVersion}:${value.appearanceId}`

const parseDefinition = (data: Record<string, unknown>): ItemDefinition => {
  const value = data.definition as ItemDefinition
  if (!value || !idPattern.test(value.id) || !value.name) throw new Error('Invalid item definition')
  return value
}

const validateItem = (item: InventoryItem, definition: ItemDefinition) => {
  const max = definition.maxQuantity ?? (definition.stackable ? Number.MAX_SAFE_INTEGER : 1)
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > max || (!definition.stackable && item.quantity !== 1)) {
    throw new Error(`Invalid item quantity: ${item.id}`)
  }
  if (definition.stateSchema) {
    const result = jsonSchemaToZod(definition.stateSchema).safeParse(item.state)
    if (!result.success) throw new Error(`Invalid item state: ${item.id}`)
  } else if (Object.keys(item.state).length) throw new Error(`Item state is not declared: ${item.id}`)
}

export function projectLoadout(
  definitions: ReadonlyMap<string, ItemDefinition>,
  inventory: ReadonlyMap<string, InventoryItem>,
  loadout: CharacterLoadout,
): LoadoutProjection {
  const capabilities = new Set<string>()
  const actionIds = new Set<string>()
  const facts = new Set<string>()
  const equippedDefinitionIds = new Set<string>()
  const appearances: Record<string, AppearanceRef | null> = {}
  for (const [slot, inventoryId] of Object.entries(loadout.equipment)) {
    if (!inventoryId) continue
    const item = inventory.get(inventoryId)
    const definition = item && definitions.get(item.definitionId)
    if (!item || !definition || definition.equipSlot !== slot) throw new Error(`Invalid equipped item: ${inventoryId}`)
    const appearance = loadout.appearanceOverrides[slot] ?? definition.defaultAppearance ?? null
    equippedDefinitionIds.add(definition.id)
    appearances[slot] = appearance
    definition.grants?.forEach((value) => capabilities.add(value))
    definition.actionIds?.forEach((value) => actionIds.add(value))
    definition.appearanceFacts
      ?.filter((binding) => JSON.stringify(binding.appearance) === JSON.stringify(appearance))
      .flatMap(({ facts: values }) => values)
      .forEach((value) => facts.add(value))
  }
  return {
    capabilities: [...capabilities].sort(),
    actionIds: [...actionIds].sort(),
    trustedAppearanceFacts: [...facts].sort(),
    appearances,
    ownedDefinitionIds: [...new Set([...inventory.values()].map(({ definitionId }) => definitionId))].sort(),
    equippedDefinitionIds: [...equippedDefinitionIds].sort(),
    quantities: [...inventory.values()].reduce<Record<string, number>>((result, item) => {
      result[item.definitionId] = (result[item.definitionId] ?? 0) + item.quantity
      return result
    }, {}),
    itemStates: Object.fromEntries([...inventory.values()].map(({ id, state }) => [id, state])),
  }
}

export async function planItemEffects(entries: EntryReader, runId: string, effects: ItemEffect[]) {
  const appearances = new Set<string>()
  for (const entry of await entries.readPublished({ collection: 'character-packs' })) {
    const pack = entry.data.pack as { id?: unknown; version?: unknown; appearances?: Array<{ id?: unknown }> }
    if (typeof pack?.id !== 'string' || !Number.isSafeInteger(pack.version) || !Array.isArray(pack.appearances)) continue
    for (const appearance of pack.appearances) {
      if (typeof appearance.id === 'string') appearances.add(`${pack.id}@${pack.version}:${appearance.id}`)
    }
  }
  const definitions = new Map(
    (await entries.readPublished({ collection: 'item-definitions' })).map((entry) => {
      const definition = parseDefinition(entry.data)
      return [definition.id, definition] as const
    }),
  )
  for (const definition of definitions.values()) {
    if (definition.defaultAppearance && !appearances.has(refKey(definition.defaultAppearance))) {
      throw new Error(`Appearance not found: ${refKey(definition.defaultAppearance)}`)
    }
    for (const binding of definition.appearanceFacts ?? []) {
      if (!appearances.has(refKey(binding.appearance))) throw new Error(`Appearance fact target not found: ${refKey(binding.appearance)}`)
    }
  }
  const inventory = new Map(
    (await entries.readPublished({ collection: 'inventory-items' })).map((entry) => [entry.id, {
      id: entry.id,
      version: entry.version,
      definitionId: String(entry.data.definitionId),
      quantity: Number(entry.data.quantity),
      state: (entry.data.state ?? {}) as Record<string, unknown>,
    }]),
  )
  const loadoutId = `loadout:${runId}`
  const storedLoadout = await entries.readById(loadoutId)
  const loadout: CharacterLoadout = storedLoadout
    ? {
        id: storedLoadout.id,
        version: storedLoadout.version,
        runId,
        equipment: structuredClone((storedLoadout.data.equipment ?? {}) as Record<string, string | null>),
        appearanceOverrides: structuredClone((storedLoadout.data.appearanceOverrides ?? {}) as Record<string, import('../domain/character.ts').AppearanceRef | null>),
      }
    : { id: loadoutId, version: null, runId, equipment: {}, appearanceOverrides: {} }

  for (const effect of effects) {
    if (effect.type === 'grantItem') {
      const definition = definitions.get(effect.definitionId)
      if (!definition || !idPattern.test(effect.inventoryId)) throw new Error('Unknown item definition')
      const current = inventory.get(effect.inventoryId)
      if (current && current.definitionId !== effect.definitionId) throw new Error('Inventory ID collision')
      inventory.set(effect.inventoryId, {
        id: effect.inventoryId,
        version: current?.version ?? 0,
        definitionId: effect.definitionId,
        quantity: (current?.quantity ?? 0) + effect.quantity,
        state: structuredClone(effect.state ?? current?.state ?? {}),
      })
    } else if (effect.type === 'consumeItem') {
      const current = inventory.get(effect.inventoryId)
      if (!current || !Number.isSafeInteger(effect.quantity) || effect.quantity < 1 || current.quantity < effect.quantity) throw new Error('Cannot consume item')
      current.quantity -= effect.quantity
      if (current.quantity === 0) {
        inventory.delete(current.id)
        for (const slot of Object.keys(loadout.equipment)) if (loadout.equipment[slot] === current.id) loadout.equipment[slot] = null
      }
    } else if (effect.type === 'equipItem') {
      const current = inventory.get(effect.inventoryId)
      const definition = current && definitions.get(current.definitionId)
      if (!current || definition?.equipSlot !== effect.slot) throw new Error('Item does not fit slot')
      loadout.equipment[effect.slot] = current.id
    } else if (effect.type === 'unequipItem') {
      loadout.equipment[effect.slot] = null
    } else if (effect.type === 'setItemState') {
      const current = inventory.get(effect.inventoryId)
      if (!current) throw new Error('Inventory item not found')
      current.state = structuredClone(effect.state)
    } else {
      if (effect.appearance && !appearances.has(refKey(effect.appearance))) throw new Error(`Appearance not found: ${refKey(effect.appearance)}`)
      loadout.appearanceOverrides[effect.slot] = structuredClone(effect.appearance)
    }
  }
  for (const item of inventory.values()) {
    const definition = definitions.get(item.definitionId)
    if (!definition) throw new Error(`Definition not found: ${item.definitionId}`)
    validateItem(item, definition)
  }
  const original = new Map((await entries.readPublished({ collection: 'inventory-items' })).map((entry) => [entry.id, entry]))
  const nextLoadoutData = { runId, equipment: loadout.equipment, appearanceOverrides: loadout.appearanceOverrides }
  const itemMutations = [
    ...[...inventory.values()].filter((item) => {
      const current = original.get(item.id)
      return !current || JSON.stringify(current.data) !== JSON.stringify({ definitionId: item.definitionId, quantity: item.quantity, state: item.state })
    }).map((item) => ({
      id: item.id,
      collection: 'inventory-items' as const,
      expectedVersion: original.get(item.id)?.version ?? null,
      data: { definitionId: item.definitionId, quantity: item.quantity, state: item.state },
    })),
    ...[...original.values()].filter(({ id }) => !inventory.has(id)).map((entry) => ({
      id: entry.id,
      collection: 'inventory-items' as const,
      expectedVersion: entry.version,
      data: null,
    })),
    ...(storedLoadout && JSON.stringify(storedLoadout.data) === JSON.stringify(nextLoadoutData) ? [] : [{
      id: loadout.id,
      collection: 'character-loadouts' as const,
      expectedVersion: loadout.version,
      data: nextLoadoutData,
    }]),
  ]
  return { itemMutations, projection: projectLoadout(definitions, inventory, loadout) }
}

export async function commitItemAction(
  entries: EntryReader,
  actions: ActionRepository,
  input: { bundleId: string; runId: string; expectedRevision: number; idempotencyKey: string; effects: ItemEffect[]; now?: number },
) {
  const run = await entries.readById(input.runId)
  if (!run || run.collection !== 'runs') throw new Error(`Run not found: ${input.runId}`)
  const plan = await planItemEffects(entries, input.runId, input.effects)
  const now = input.now ?? Date.now()
  await actions.commit({
    bundleId: input.bundleId,
    runId: input.runId,
    expectedRevision: input.expectedRevision,
    actionId: 'item-action',
    idempotencyKey: input.idempotencyKey,
    nextRunData: { ...run.data, revision: input.expectedRevision + 1 },
    eventData: { runId: input.runId, actionId: 'item-action', idempotencyKey: input.idempotencyKey, summary: 'Item state changed', createdAtMs: now },
    now,
    itemMutations: plan.itemMutations,
  })
  return plan.projection
}
