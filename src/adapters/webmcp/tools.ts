import {
  projectCallableCapabilities,
  type MantleRuntime,
  type ProcedureCallableCapability,
  type RuntimePlan,
} from '@aotter/mantle-runtime'

import type { AgentCapability } from '../../core/application/ports.ts'

type ModelContext = {
  registerTool(tool: {
    name: string
    title?: string
    description: string
    inputSchema: object
    annotations?: { readOnlyHint?: boolean }
    execute(input: Record<string, unknown>): Promise<unknown>
  }, options?: { signal?: AbortSignal }): Promise<void>
}

type WebMcpDocument = Document & { modelContext?: ModelContext }
export type MantleToolInvoker = (trigger: string, input: unknown) => ReturnType<MantleRuntime['invokeTrigger']>

export function createAgentCapability(document: Document): AgentCapability {
  return { isAvailable: () => Boolean((document as WebMcpDocument).modelContext) }
}

export async function registerMantleWebMcpTools(
  document: Document,
  plan: RuntimePlan,
  invoke: MantleToolInvoker,
): Promise<(() => void) | null> {
  const modelContext = (document as WebMcpDocument).modelContext
  if (!modelContext) return null

  const tools = projectCallableCapabilities(plan, { surface: 'public' })
    .filter((capability): capability is ProcedureCallableCapability => capability.kind === 'procedure')
    .map((capability) => {
      return {
        name: capability.name,
        ...(capability.title ? { title: capability.title } : {}),
        description: capability.description,
        inputSchema: capability.inputSchema,
        annotations: { readOnlyHint: capability.inputSchema.readOnly === true },
        async execute(input: Record<string, unknown>) {
          const result = await invoke(capability.trigger, input)
          return result.ok ? result.data : { status: 'error', diagnostics: [result.diagnostic] }
        },
      }
    })

  const controller = new AbortController()
  try {
    await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })))
  } catch (error) {
    controller.abort()
    throw error
  }
  return () => controller.abort()
}
