import type { Application } from './src/bootstrap.ts'
import type { AgentCustomization } from './src/core/application/authoring.ts'

export const AOZU_PARTNERS = [
  { id: 'otter', kind: 'mascot', name: 'AOZU · 布丁獺', displayName: '布丁獺', role: '生活探險家', image: '/assets/mascot-otter-v1.png', portrait: '/assets/portrait-otter-v1.png', accent: '#e6454f', personality: '開朗、黏人、行動派', quote: '今天想先從哪一件小事開始？', capabilities: ['計步與健身', '旅行任務', '換裝成長'] },
  { id: 'seal', kind: 'mascot', name: 'AOZU · 泡泡海豹', displayName: '泡泡海豹', role: '飲食應援員', image: '/assets/mascot-seal-v1.png', portrait: '/assets/portrait-seal-v1.png', accent: '#5fa9d5', personality: '溫柔、樂觀、懂得傾聽', quote: '好好吃飯，也是一種了不起的冒險。', capabilities: ['飲控紀錄', '美食日誌', '生活陪伴'] },
  { id: 'whale', kind: 'mascot', name: 'AOZU · 夜航鯨', displayName: '夜航鯨', role: '旅程導航員', image: '/assets/mascot-whale-v1.png', portrait: '/assets/portrait-whale-v1.png', accent: '#5961a8', personality: '安定、可靠、富有想像力', quote: '把遠方拆成下一個能完成的步驟。', capabilities: ['旅行書整理', '行程規劃', '共同筆記'] },
  { id: 'weasel', kind: 'mascot', name: 'AOZU · 琥珀鼬', displayName: '琥珀鼬', role: '居家理財家', image: '/assets/mascot-weasel-v1.png', portrait: '/assets/portrait-weasel-v1.png', accent: '#d98441', personality: '細心、務實、整理高手', quote: '整理好房間和帳目，心也會變輕。', capabilities: ['記帳分類', '房間規劃', '目標存款'] },
  { id: 'mikan', kind: 'human', name: 'AOZU · 電獺少女・蜜柑', displayName: '蜜柑', role: '暖陽外景主持', image: '/assets/aotter-girl-mikan-hd-v2.png', portrait: '/assets/portrait-mikan-v1.png', accent: '#e6963a', personality: '開朗、好奇、行動派', quote: '出發吧，我們把今天過成一段值得收藏的故事。', capabilities: ['城市探索', '穿搭日誌', '運動挑戰'] },
  { id: 'space', kind: 'human', name: 'AOZU · 電獺少女・Spac1', displayName: 'Spac1', role: '星系生活策展人', image: '/assets/aotter-girl-space-hd-v3.png', portrait: '/assets/portrait-spac1-v1.png', accent: '#70a8bd', personality: '溫柔、靈敏、想像力豐富', quote: '把想法交給我，我們一起找到最閃亮的路線。', capabilities: ['共同筆記', '語言學習', '旅行靈感'] },
  { id: 'xixi', kind: 'human', name: 'AOZU · 電獺少女・嘻嘻', displayName: '嘻嘻', role: '元氣行動教練', image: '/assets/aotter-girl-xixi-hd-v3.png', portrait: '/assets/portrait-xixi-v1.png', accent: '#5d9fd0', personality: '爽朗、自信、感染力十足', quote: '笑一下，下一個任務我們就一起動起來！', capabilities: ['健身挑戰', '穿搭日誌', '日常應援'] },
] as const

export const AOZU_WARDROBE_SLOTS = [
  { id: 'wardrobe-head', label: '頭部', x: 50, y: 24, size: 32 },
  { id: 'wardrobe-body', label: '衣服', x: 50, y: 57, size: 50 },
  { id: 'wardrobe-back', label: '背部', x: 70, y: 59, size: 26 },
  { id: 'wardrobe-hand', label: '手持', x: 24, y: 49, size: 21 },
] as const

export type AozuWardrobeSlotId = (typeof AOZU_WARDROBE_SLOTS)[number]['id']

export const AOZU_WARDROBE_ITEMS = [
  { id: 'explorer-bandana', label: '赤葉頭巾', theme: '探險', slot: 'wardrobe-head', image: '/assets/otter-explorer-accessories-v1.png', crop: [590, 220, 410, 450] },
  { id: 'explorer-vest', label: '多袋探險背心', theme: '探險', slot: 'wardrobe-body', image: '/assets/otter-explorer-accessories-v1.png', crop: [45, 110, 570, 680] },
  { id: 'explorer-binoculars', label: '黑金望遠鏡', theme: '探險', slot: 'wardrobe-back', image: '/assets/otter-explorer-accessories-v1.png', crop: [80, 750, 510, 350] },
  { id: 'explorer-compass', label: '黃金羅盤', theme: '探險', slot: 'wardrobe-hand', image: '/assets/otter-explorer-accessories-v1.png', crop: [610, 690, 360, 360] },
  { id: 'coffee-scarf', label: '奶泡小領巾', theme: '咖啡', slot: 'wardrobe-head', image: '/assets/otter-coffee-accessories-v1.png', crop: [600, 140, 390, 440] },
  { id: 'coffee-apron', label: '手沖咖啡圍裙', theme: '咖啡', slot: 'wardrobe-body', image: '/assets/otter-coffee-accessories-v1.png', crop: [30, 150, 610, 970] },
  { id: 'coffee-dripper', label: '隨行手沖包', theme: '咖啡', slot: 'wardrobe-back', image: '/assets/otter-coffee-accessories-v1.png', crop: [620, 1000, 350, 430] },
  { id: 'coffee-cup', label: '拿鐵隨行杯', theme: '咖啡', slot: 'wardrobe-hand', image: '/assets/otter-coffee-accessories-v1.png', crop: [680, 570, 300, 430] },
  { id: 'focus-headphones', label: '專注耳機', theme: '專注', slot: 'wardrobe-head', image: '/assets/otter-focus-accessories-v1.png', crop: [220, 60, 580, 410] },
  { id: 'focus-jacket', label: '智慧機能外套', theme: '專注', slot: 'wardrobe-body', image: '/assets/otter-focus-accessories-v1.png', crop: [80, 440, 840, 660] },
  { id: 'focus-tablet', label: '智慧共筆板', theme: '專注', slot: 'wardrobe-back', image: '/assets/otter-focus-accessories-v1.png', crop: [70, 1080, 470, 340] },
  { id: 'focus-stylus', label: '記憶觸控筆', theme: '專注', slot: 'wardrobe-hand', image: '/assets/otter-focus-accessories-v1.png', crop: [540, 1090, 150, 340] },
  { id: 'night-moon', label: '弦月髮飾', theme: '夜航', slot: 'wardrobe-head', image: '/assets/otter-night-accessories-v1.png', crop: [590, 1120, 240, 320] },
  { id: 'night-cape', label: '星夜旅行披風', theme: '夜航', slot: 'wardrobe-body', image: '/assets/otter-night-accessories-v1.png', crop: [470, 90, 510, 690] },
  { id: 'night-satchel', label: '星軌側背包', theme: '夜航', slot: 'wardrobe-back', image: '/assets/otter-night-accessories-v1.png', crop: [60, 1040, 540, 400] },
  { id: 'night-lantern', label: '暖光提燈', theme: '夜航', slot: 'wardrobe-hand', image: '/assets/otter-night-accessories-v1.png', crop: [650, 730, 260, 410] },
  { id: 'voyage-cap', label: '波浪船長帽', theme: '遠航', slot: 'wardrobe-head', image: '/assets/otter-voyage-accessories-v1.png', crop: [260, 50, 520, 270] },
  { id: 'voyage-jacket', label: '紅白遠航夾克', theme: '遠航', slot: 'wardrobe-body', image: '/assets/otter-voyage-accessories-v1.png', crop: [200, 320, 790, 780] },
  { id: 'voyage-tag', label: '港口行李吊牌', theme: '遠航', slot: 'wardrobe-back', image: '/assets/otter-voyage-accessories-v1.png', crop: [100, 1050, 370, 380] },
  { id: 'voyage-passport', label: '掌上航海證', theme: '遠航', slot: 'wardrobe-hand', image: '/assets/otter-voyage-accessories-v1.png', crop: [30, 340, 230, 310] },
] as const satisfies ReadonlyArray<{ id: string; label: string; theme: string; slot: AozuWardrobeSlotId; image: string; crop: readonly [number, number, number, number] }>

export const AOZU_TRAVEL_ACCESSORIES = [
  { id: 'route-pin', icon: '⌖', threshold: 30, skill: '規劃', names: { otter: '葉脈旅標', seal: '泡泡旅標', whale: '星航旅標', weasel: '琥珀路章', mikan: '晴橘路章', space: '星圖定位章', xixi: '元氣行程章' } },
  { id: 'compass', icon: '◇', threshold: 60, skill: '探索', names: { otter: '貝殼羅盤', seal: '潮汐羅盤', whale: '夜航羅盤', weasel: '收納羅盤', mikan: '曜橘羅盤', space: '星軌羅盤', xixi: '躍動羅盤' } },
  { id: 'memory-camera', icon: '▣', threshold: 100, skill: '羈絆', names: { otter: '探險記憶相機', seal: '海風記憶相機', whale: '星夜記憶相機', weasel: '日常記憶相機', mikan: '外景記憶相機', space: '星光記憶相機', xixi: '笑顏記憶相機' } },
] as const

export type TravelJournalEntry = {
  id: string
  day: 1 | 2 | 3
  kind: 'spot' | 'food'
  name: string
  location: string
  checked: boolean
}

export type TravelJournalState = {
  title: string
  equippedAccessoryId: 'none' | (typeof AOZU_TRAVEL_ACCESSORIES)[number]['id']
  entries: TravelJournalEntry[]
  points: { exploration: number; taste: number; planning: number; bond: number }
}

export const DEFAULT_TRAVEL_JOURNAL: TravelJournalState = {
  title: '台南三日散步旅行',
  equippedAccessoryId: 'none',
  entries: [
    { id: 'stop-art-museum', day: 1, kind: 'spot', name: '臺南市美術館二館', location: '中西區忠義路二段', checked: false },
    { id: 'stop-rice-cake', day: 1, kind: 'food', name: '保安路米糕', location: '中西區保安路', checked: false },
    { id: 'stop-shennong', day: 2, kind: 'spot', name: '神農街散步', location: '中西區神農街', checked: false },
  ],
  points: { exploration: 12, taste: 8, planning: 10, bond: 4 },
}

const lifeActions: AgentCustomization['stages'][number]['actions'] = [
  { id: 'steps', label: '記錄散步', phrases: ['記錄散步', '散步完成', '今天的步數完成了'], effects: [{ type: 'addMetric', metricId: 'steps', amount: 1 }, { type: 'addMetric', metricId: 'bond', amount: 1 }] },
  { id: 'fitness', label: '完成訓練', phrases: ['完成訓練', '健身完成', '我做完運動了'], effects: [{ type: 'addMetric', metricId: 'vitality', amount: 8 }, { type: 'addMetric', metricId: 'focus', amount: 3 }, { type: 'addMetric', metricId: 'bond', amount: 1 }] },
  { id: 'meals', label: '記錄一餐', phrases: ['記錄一餐', '記錄晚餐', '飲食記錄完成'], effects: [{ type: 'addMetric', metricId: 'rhythm', amount: 1 }, { type: 'addMetric', metricId: 'bond', amount: 2 }] },
  { id: 'money', label: '整理帳目', phrases: ['整理帳目', '記帳完成', '分類收據'], effects: [{ type: 'addMetric', metricId: 'focus', amount: 3 }, { type: 'addMetric', metricId: 'shells', amount: 5 }] },
  { id: 'travel', label: '繼續規劃', phrases: ['繼續規劃', '安排旅行', '完成行程'], effects: [{ type: 'addMetric', metricId: 'exploration', amount: 12 }, { type: 'addMetric', metricId: 'bond', amount: 2 }] },
]

const wardrobeActions: AgentCustomization['stages'][number]['actions'] = [
  ...AOZU_WARDROBE_SLOTS.map((slot) => ({
    id: `clear-${slot.id}`,
    label: `卸下${slot.label}物件`,
    phrases: [`卸下${slot.label}物件`],
    effects: [{ type: 'unequipItem' as const, slot: slot.id }],
  })),
  ...AOZU_WARDROBE_ITEMS.map((item) => ({
    id: `wear-${item.id}`,
    label: `穿上${item.label}`,
    phrases: [`穿上${item.label}`],
    effects: [{ type: 'equipItem' as const, inventoryId: `wardrobe-${item.id}`, slot: item.slot }],
  })),
]

const makeCustomization = (partner: (typeof AOZU_PARTNERS)[number]): AgentCustomization => ({
  id: `aozu-${partner.id}-v4`,
  name: partner.name,
  completionMode: 'continuous',
  initialStageId: 'today',
  stages: [{
    id: 'today',
    title: '今天想一起做什麼？',
    narrative: `${partner.displayName}在生活伴生域等你，陪你把每一件小事變成可累積的成長。`,
    agentFallback: true,
    actions: [...lifeActions, ...wardrobeActions],
  }],
  items: [
    ...AOZU_WARDROBE_ITEMS.map(({ id, label, slot }) => ({
      id: `wardrobe-${id}`,
      name: label,
      inventoryId: `wardrobe-${id}`,
      equipSlot: slot,
      grants: [`wardrobe.${id}`],
      state: { x: 0, y: 0, scale: 1 },
      stateSchema: {
        type: 'object' as const,
        properties: {
          x: { type: 'number' as const, minimum: -35, maximum: 35 },
          y: { type: 'number' as const, minimum: -35, maximum: 35 },
          scale: { type: 'number' as const, minimum: 0.7, maximum: 1.3 },
        },
        required: ['x', 'y', 'scale'],
        additionalProperties: false,
      },
    })),
    {
      id: 'travel-journal',
      name: '旅行手札',
      inventoryId: 'travel-journal',
      equipSlot: 'journal',
      grants: ['travel.journal'],
      state: structuredClone(DEFAULT_TRAVEL_JOURNAL),
      stateSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          equippedAccessoryId: { type: 'string', enum: ['none', 'route-pin', 'compass', 'memory-camera'] },
          entries: {
            type: 'array',
            maxItems: 60,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 80 },
                day: { type: 'integer', minimum: 1, maximum: 3 },
                kind: { type: 'string', enum: ['spot', 'food'] },
                name: { type: 'string', minLength: 1, maxLength: 80 },
                location: { type: 'string', minLength: 1, maxLength: 120 },
                checked: { type: 'boolean' },
              },
              required: ['id', 'day', 'kind', 'name', 'location', 'checked'],
              additionalProperties: false,
            },
          },
          points: {
            type: 'object',
            properties: {
              exploration: { type: 'integer', minimum: 0, maximum: 9999 },
              taste: { type: 'integer', minimum: 0, maximum: 9999 },
              planning: { type: 'integer', minimum: 0, maximum: 9999 },
              bond: { type: 'integer', minimum: 0, maximum: 9999 },
            },
            required: ['exploration', 'taste', 'planning', 'bond'],
            additionalProperties: false,
          },
        },
        required: ['title', 'equippedAccessoryId', 'entries', 'points'],
        additionalProperties: false,
      },
    },
  ],
  initialEquipment: {},
})

export const AOZU_CUSTOMIZATION = makeCustomization(AOZU_PARTNERS[0])
export type AozuStartup = Extract<Awaited<ReturnType<Application['loadStartup']>>, { status: 'main' }>

export async function ensureAozuCompanions(application: Application): Promise<AozuStartup> {
  let startup = await application.loadStartup()
  const currentName = startup.status === 'main' ? startup.companion.name : null
  const explorerPlacement = startup.status === 'main' ? startup.loadout.itemStates['wardrobe-explorer-vest'] : undefined
  const currentHasPlacement = startup.status === 'main'
    && startup.stage.actions.some(({ id }) => id === 'wear-explorer-vest')
    && typeof explorerPlacement?.x === 'number'
    && typeof explorerPlacement?.y === 'number'
    && typeof explorerPlacement?.scale === 'number'
  const journalState = startup.status === 'main' ? startup.loadout.itemStates['travel-journal'] : undefined
  const currentHasJournal = Array.isArray(journalState?.entries) && typeof journalState?.points === 'object'
  const saved = new Map(startup.savedCompanions.map((companion) => [companion.name, companion.bundleId]))
  const requiresUpgrade = !currentHasPlacement || !currentHasJournal

  if (requiresUpgrade || AOZU_PARTNERS.some(({ name }) => !saved.has(name))) {
    for (const partner of AOZU_PARTNERS) {
      if (!requiresUpgrade && saved.has(partner.name)) continue
      const preview = await application.preparePreset(makeCustomization(partner))
      await application.approveCandidate(preview.bundleId, true)
      saved.set(partner.name, preview.bundleId)
    }
    const preferredName = currentName && AOZU_PARTNERS.some(({ name }) => name === currentName)
      ? currentName
      : AOZU_PARTNERS[0].name
    await application.activateCompanion(saved.get(preferredName)!)
    startup = await application.loadStartup()
  }

  if (startup.status !== 'main') throw new Error('AOZU Companions failed to activate')
  return startup
}
