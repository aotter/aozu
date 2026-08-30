import type { AgentCapability } from '../../core/application/ports.ts'

type WebMcpDocument = Document & { modelContext?: unknown }

export function createAgentCapability(document: Document): AgentCapability {
  return {
    isAvailable: () => Boolean((document as WebMcpDocument).modelContext),
  }
}
