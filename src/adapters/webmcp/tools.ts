import {
  projectCallableCapabilities,
  type MantleRuntime,
  type ProcedureCallableCapability,
  type RuntimePlan,
} from '@aotter/mantle-runtime'
import { bindWebMcp, type WebMcpModelContext } from '@aotter/mantle-web/webmcp'

import type { AgentCapability } from '../../core/application/ports.ts'

type WebMcpDocument = Document & { modelContext?: WebMcpModelContext }
export type MantleToolInvoker = (trigger: string, input: unknown) => ReturnType<MantleRuntime['invokeTrigger']>

export function createAgentCapability(document: Document): AgentCapability {
  return { isAvailable: () => Boolean((document as WebMcpDocument).modelContext) }
}

export async function bindMantleWebMcpTools(
  document: Document,
  plan: RuntimePlan,
  invoke: MantleToolInvoker,
): Promise<(() => void) | null> {
  const modelContext = (document as WebMcpDocument).modelContext
  if (!modelContext) return null

  const capabilities = projectCallableCapabilities(plan, { surface: 'public' })
    .filter((capability): capability is ProcedureCallableCapability => capability.kind === 'procedure')
  const binding = await bindWebMcp({
    modelContext,
    capabilities,
    async invoke(capability, input, signal) {
      signal.throwIfAborted()
      if (capability.kind !== 'procedure') throw new Error('Unsupported WebMCP capability')
      const result = await invoke(capability.trigger, input)
      if (!result.ok) throw result.diagnostic
      return result.data
    },
  })
  return () => binding.dispose()
}
