import type { AgentCapability } from '../../core/application/ports.ts'

type ModelContext = {
  registerTool(tool: {
    name: string
    title: string
    description: string
    inputSchema: object
    annotations?: { readOnlyHint?: boolean }
    execute(input: Record<string, unknown>): Promise<unknown>
  }, options?: { signal?: AbortSignal }): Promise<void>
}

type WebMcpDocument = Document & { modelContext?: ModelContext }

export function createAgentCapability(document: Document): AgentCapability {
  return {
    isAvailable: () => Boolean((document as WebMcpDocument).modelContext),
  }
}

export function registerCompanionTools(document: Document, useCases: {
  inspect(): Promise<unknown>
  inspectCharacter(): Promise<unknown>
  submit(input: { actionId: string; expectedRevision: number; idempotencyKey: string }): Promise<unknown>
  resolve(input: { turnId: string; idempotencyKey: string; dialogue: string; effects: unknown }): Promise<unknown>
}) {
  const modelContext = (document as WebMcpDocument).modelContext
  if (!modelContext) return null
  const controller = new AbortController()
  void Promise.all([
    modelContext.registerTool({
      name: 'inspect_character_contract',
      title: 'Inspect Character Contract',
      description: 'Required first step before generating or changing character art. Returns the exact rig and production brief. Generate and preprocess assets outside the website, then submit only final 512×768 RGBA PNG layers. The website validates but never removes backgrounds, resizes, realigns, or repairs images.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => useCases.inspectCharacter(),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'inspect_companion',
      title: 'Inspect Companion',
      description: 'Required first step for Companion interaction. Read the current stage, revision, prepared actions, and persisted pending user turns. When a pending turn exists, act as the character and call resolve_companion_turn; put the character response in the website instead of printing it in agent chat.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => useCases.inspect(),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'submit_companion_action',
      title: 'Submit Companion Action',
      description: 'Execute one prepared website action with the exact current revision. The website validates and atomically records effects and progress. Inspect first; never invent action IDs or revisions.',
      inputSchema: {
        type: 'object',
        properties: {
          actionId: { type: 'string', minLength: 1 },
          expectedRevision: { type: 'integer', minimum: 0 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
        },
        required: ['actionId', 'expectedRevision', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => useCases.submit({
        actionId: String(input.actionId),
        expectedRevision: Number(input.expectedRevision),
        idempotencyKey: String(input.idempotencyKey),
      }),
    }, { signal: controller.signal }),
    modelContext.registerTool({
      name: 'resolve_companion_turn',
      title: 'Resolve Companion Turn',
      description: 'Write the character response and validated effects directly into the website for one persisted pending turn. Keep your normal agent personality outside the tool; apply the Companion character voice only to dialogue. Do not repeat the dialogue in agent chat after this succeeds.',
      inputSchema: {
        type: 'object',
        properties: {
          turnId: { type: 'string', minLength: 1 },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 },
          dialogue: { type: 'string', minLength: 1, maxLength: 8000 },
          effects: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['addMetric', 'setFlag', 'changeStage'] },
                metricId: { type: 'string' },
                amount: { type: 'number' },
                flagId: { type: 'string' },
                value: { type: 'boolean' },
                stageId: { type: 'string' },
              },
              required: ['type'],
              additionalProperties: false,
            },
          },
        },
        required: ['turnId', 'idempotencyKey', 'dialogue', 'effects'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => useCases.resolve({
        turnId: String(input.turnId),
        idempotencyKey: String(input.idempotencyKey),
        dialogue: String(input.dialogue),
        effects: input.effects,
      }),
    }, { signal: controller.signal }),
  ]).catch((error) => console.error('WebMCP registration failed', error))
  return () => controller.abort()
}
