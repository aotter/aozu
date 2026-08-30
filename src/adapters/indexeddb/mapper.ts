import type { ActiveCompanion } from '../../core/domain/companion.ts'

export function mapActiveCompanion(value: unknown): ActiveCompanion | null {
  if (value === undefined) return null
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid local Companion record')
  }

  const { id, name } = value as Record<string, unknown>
  if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0) {
    throw new Error('Local Companion identity is incomplete')
  }

  return { id, name }
}
