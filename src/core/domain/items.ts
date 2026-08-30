import type { JsonSchema } from '@aotter/mantle-spec'
import type { AppearanceRef } from './character.ts'

export interface ItemDefinition {
  id: string
  name: string
  equipSlot?: string
  defaultAppearance?: AppearanceRef
  grants?: string[]
  actionIds?: string[]
  stackable?: boolean
  maxQuantity?: number
  stateSchema?: JsonSchema
  appearanceFacts?: Array<{ appearance: AppearanceRef; facts: string[] }>
}

export interface InventoryItem {
  id: string
  version: number
  definitionId: string
  quantity: number
  state: Record<string, unknown>
}

export interface CharacterLoadout {
  id: string
  version: number | null
  runId: string
  equipment: Record<string, string | null>
  appearanceOverrides: Record<string, AppearanceRef | null>
}

export type ItemEffect =
  | { type: 'grantItem'; inventoryId: string; definitionId: string; quantity: number; state?: Record<string, unknown> }
  | { type: 'consumeItem'; inventoryId: string; quantity: number }
  | { type: 'equipItem'; inventoryId: string; slot: string }
  | { type: 'unequipItem'; slot: string }
  | { type: 'setItemState'; inventoryId: string; state: Record<string, unknown> }
  | { type: 'setAppearanceOverride'; slot: string; appearance: AppearanceRef | null }

export interface LoadoutProjection {
  capabilities: string[]
  actionIds: string[]
  trustedAppearanceFacts: string[]
  appearances: Record<string, AppearanceRef | null>
  ownedDefinitionIds: string[]
  equippedDefinitionIds: string[]
  quantities: Record<string, number>
  itemStates: Record<string, Record<string, unknown>>
}
