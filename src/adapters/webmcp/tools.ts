import { resolveLocalizedText, type JsonSchema } from '@aotter/mantle-spec'
import type { MantleRuntime, RuntimePlan } from '@aotter/mantle-runtime'

import type { AgentCapability } from '../../core/application/ports.ts'

type ModelContext = {
  registerTool(tool: {
    name: string
    title: string
    description: string
    inputSchema: JsonSchema
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

  const names = new Set<string>()
  const tools = plan.mcpTools
    .flatMap((tool) => tool.ownerKind === 'Procedure' && tool.surface === 'public' ? [tool] : [])
    .map((tool) => {
      if (names.has(tool.name)) throw new Error(`Duplicate public WebMCP tool: ${tool.name}`)
      names.add(tool.name)
      const procedure = plan.procedures[tool.ownerName]
      if (!procedure) throw new Error(`WebMCP Procedure is missing: ${tool.ownerName}`)
      const triggers = Object.values(plan.triggers).filter(({ manifest, target }) =>
        target === tool.ownerName && manifest.spec.source.kind === 'mcp' && manifest.spec.source.surface === 'public',
      )
      if (triggers.length !== 1 || triggers[0]!.name !== tool.trigger) {
        throw new Error(`WebMCP Procedure requires exactly one public Trigger: ${tool.ownerName}`)
      }
      const title = resolveLocalizedText(procedure.manifest.spec.title, 'en')
      const description = resolveLocalizedText(procedure.manifest.spec.description, 'en')
      if (!title || !description) throw new Error(`WebMCP Procedure requires title and description: ${tool.ownerName}`)
      return {
        name: tool.name,
        title,
        description,
        inputSchema: procedure.manifest.spec.input,
        annotations: { readOnlyHint: procedure.manifest.spec.input.readOnly === true },
        async execute(input: Record<string, unknown>) {
          const result = await invoke(triggers[0]!.name, input)
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
