'use client';

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { AOZU_PARTNERS, AOZU_TRAVEL_ACCESSORIES, AOZU_WARDROBE_ITEMS, AOZU_WARDROBE_SLOTS, DEFAULT_TRAVEL_JOURNAL, ensureAozuCompanions, type AozuStartup, type AozuWardrobeSlotId, type TravelJournalState } from '../companion/aozu.ts';
import type { AdventureMode } from '../companion/adventure.ts';
import { createApplication, type Application } from '../companion/src/bootstrap.ts';
import { AdventureGame } from './adventure-game.tsx';

const modules = [
  { id: 'meals', category: '食', icon: '食', label: '飲控', value: '2 / 3 餐', note: '晚餐補一份蔬菜', action: '記錄一餐', quest: '不用算得很精準，記下晚餐和今天的飽足感就好。', reward: '規律 +1 ・ 羈絆 +2', color: '#f1b64c' },
  { id: 'money', category: '住', icon: '住', label: '記帳', value: '$720 今日', note: '旅行基金本月 72%', action: '整理帳目', quest: '有一張咖啡收據還沒分類，確認後就更新本週花費。', reward: '專注 +3 ・ 貝殼 +5', color: '#62a989' },
  { id: 'steps', category: '行', icon: '行', label: '計步', value: '6,840 步', note: '再走 1,160 步', action: '記錄散步', quest: '和夥伴散步 12 分鐘，找一個從沒注意過的街角。', reward: '活力 +5 ・ 貝殼 +10', color: '#5da7d8' },
  { id: 'travel', category: '行', icon: '旅', label: '旅遊', value: '台南 3 日', note: '旅行書完成 68%', action: '繼續規劃', quest: '一起完成台南旅行書：確認第二天的步行節奏與晚餐預算。', reward: '探索 +12 ・ 探險配件', color: '#e76a72' },
  { id: 'fitness', category: '育', icon: '育', label: '健身', value: '18:30', note: '全身入門 ・ 24 分', action: '完成訓練', quest: '今天是輕量全身訓練，完成後再一起調整下一次強度。', reward: '活力 +8 ・ 專注 +3', color: '#9a78d1' },
] as const;

const panels = [
  { id: 'quests', icon: '六', label: '生活' },
  { id: 'wardrobe', icon: '衣', label: '衣櫥' },
  { id: 'journal', icon: '札', label: '手札' },
  { id: 'cards', icon: '卡', label: '卡片' },
  { id: 'memories', icon: '憶', label: '記憶' },
  { id: 'adventure', icon: '遊', label: '冒險' },
] as const;

type PanelId = (typeof panels)[number]['id'];
type ModuleId = (typeof modules)[number]['id'];
type Partner = (typeof AOZU_PARTNERS)[number];
type WardrobeItem = (typeof AOZU_WARDROBE_ITEMS)[number];
type Placement = { x: number; y: number; scale: number };
type TravelKind = 'spot' | 'food';
type TravelChatMessage = { id: string; from: 'partner' | 'user'; text: string };
type AgentProposal =
  | { id: string; kind: 'life'; activity: Exclude<ModuleId, 'travel'>; summary: string; dialogue?: string }
  | { id: string; kind: 'travel'; title: string; stops: { day: 1 | 2 | 3; kind: TravelKind; name: string; location: string }[]; dialogue?: string }
  | { id: string; kind: 'outfit'; itemId: string; dialogue?: string }
  | { id: string; kind: 'memory'; title: string; summary: string; category: 'life' | 'travel' | 'writing' | 'learning' | 'bond'; dialogue?: string }
  | { id: string; kind: 'card'; title: string; ability: string; summary: string; requiredCapabilities: string[]; dialogue?: string };
type SavedMemory = { id: string; partnerId: Partner['id']; title: string; summary: string; category: 'life' | 'travel' | 'writing' | 'learning' | 'bond'; createdAt: number };
type SavedAbilityCard = { id: string; partnerId: Partner['id']; title: string; ability: string; summary: string; requiredCapabilities: string[]; createdAt: number };
type SavedLifeRecord = { id: string; partnerId: Partner['id']; activity: Exclude<ModuleId, 'travel'>; summary: string; createdAt: number };

const AOZU_MEMORY_KEY = 'aozu:p0-memories';
const AOZU_CARD_KEY = 'aozu:p0-ability-cards';
const AOZU_LIFE_KEY = 'aozu:p0-life-records';
const memoryCategoryLabels = { life: '生', travel: '旅', writing: '寫', learning: '學', bond: '伴' } as const;

const readStoredList = <T,>(key: string): T[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};

const saveStoredList = <T extends { id: string }>(key: string, current: T[], value: T) => {
  const next = [...current.filter(({ id }) => id !== value.id), value].slice(-100);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
};

const agentProposalTitle = (proposal: AgentProposal) => {
  if (proposal.kind === 'life') return `${modules.find(({ id }) => id === proposal.activity)?.label ?? '生活'}冒險紀錄`;
  if (proposal.kind === 'travel') return proposal.title;
  if (proposal.kind === 'outfit') return `穿上${AOZU_WARDROBE_ITEMS.find(({ id }) => id === proposal.itemId)?.label ?? '新配件'}`;
  if (proposal.kind === 'memory') return proposal.title;
  return proposal.title;
};

const agentProposalSummary = (proposal: AgentProposal) => {
  if (proposal.kind === 'life') return proposal.summary;
  if (proposal.kind === 'travel') return `${proposal.stops.length} 個地點將加入旅行手札`;
  if (proposal.kind === 'outfit') return '確認後才會替換同部位配件並重新合成角色造型。';
  if (proposal.kind === 'memory') return proposal.summary;
  return `${proposal.ability}｜${proposal.summary}`;
};

const lifeControls: readonly { id: string; mark: string; label: string; panel: PanelId; module?: ModuleId; tone: string }[] = [
  { id: 'food', mark: '食', label: '飲控', panel: 'quests', module: 'meals', tone: '#f2b84b' },
  { id: 'wear', mark: '衣', label: '衣櫥', panel: 'wardrobe', tone: '#e87583' },
  { id: 'home', mark: '住', label: '記帳', panel: 'quests', module: 'money', tone: '#5ead8b' },
  { id: 'move', mark: '行', label: '旅遊', panel: 'quests', module: 'travel', tone: '#559fd0' },
  { id: 'learn', mark: '育', label: '健身', panel: 'quests', module: 'fitness', tone: '#9272cb' },
];

const conversationGuides: Record<ModuleId, { intro: string; placeholder: string; done: string }> = {
  meals: { intro: '把今天吃了什麼、份量或飽足感貼給我，我會幫你整理成飲食紀錄。', placeholder: '例如：晚餐是雞胸、半碗飯和青菜，大約七分飽', done: '我已經收進今日飲食節奏，下一步我們只要決定是否需要補水或蔬菜。' },
  money: { intro: '把收據文字、店名、金額與用途貼給我，我會幫你分類。', placeholder: '例如：林百貨 520 元，旅遊紀念品', done: '已經幫你整理這筆支出，也保留在今日的共同記憶裡。' },
  steps: { intro: '把手機或手錶的步數貼給我，我會幫你換算今天的小任務。', placeholder: '例如：今天 6840 步，晚上還可以走 12 分鐘', done: '步數已記下，再一起走一小段就能完成今日行動任務。' },
  travel: { intro: '把想去的景點或想吃的店告訴我，我會再問位置，然後寫進旅行手札。', placeholder: '例如：我想去林百貨／想吃阿裕牛肉湯', done: '我已經把它放進旅行手札了。' },
  fitness: { intro: '把你想做的運動、可用時間與今天體感貼給我，我會陪你拆成可完成的訓練。', placeholder: '例如：今天有 20 分鐘，肩頸有點緊，想做輕量全身', done: '收到，今天先以輕量完成為目標，做完後再由你的體感調整下一次。' },
};

const defaultPlacement: Placement = { x: 0, y: 0, scale: 1 };
const legacyStarterWardrobe = ['explorer-bandana', 'explorer-vest', 'explorer-binoculars', 'explorer-compass'];
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const isMobileViewport = () => window.matchMedia('(max-width: 1050px)').matches;
const placementFrom = (state?: Record<string, unknown>): Placement => ({
  x: typeof state?.x === 'number' ? clamp(state.x, -35, 35) : 0,
  y: typeof state?.y === 'number' ? clamp(state.y, -35, 35) : 0,
  scale: typeof state?.scale === 'number' ? clamp(state.scale, 0.7, 1.3) : 1,
});

let bootPromise: Promise<{ application: Application; startup: AozuStartup }> | null = null;

function bootAozu() {
  if (!bootPromise) {
    const application = createApplication(document);
    bootPromise = ensureAozuCompanions(application)
      .then((startup) => ({ application, startup }))
      .catch((error) => {
        bootPromise = null;
        throw error;
      });
  }
  return bootPromise;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : '發生未知錯誤';

function PartnerArt({ partner, className = '', decorative = false }: { partner: Partner; className?: string; decorative?: boolean }) {
  if (partner.kind === 'human') {
    return <span className={`partner-art human-portrait ${className}`} style={{ backgroundImage: `url(${partner.image})` }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : partner.displayName} />;
  }
  return <img className={`partner-art ${className}`} src={partner.image} alt={decorative ? '' : partner.displayName} />;
}

function PartnerHeadshot({ partner, className = '', decorative = false }: { partner: Partner; className?: string; decorative?: boolean }) {
  return <span className={`partner-portrait ${className}`} style={{ backgroundImage: `url(${partner.portrait})` }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${partner.displayName}的大頭照`} aria-hidden={decorative || undefined} />;
}

function WardrobeSprite({ item, className = '' }: { item: WardrobeItem; className?: string }) {
  const [x, y, width, height] = item.crop;
  return <span className={`wardrobe-sprite ${className}`} style={{ aspectRatio: `${width} / ${height}` }}><img src={item.image} alt="" style={{ width: `${(1024 / width) * 100}%`, height: `${(1536 / height) * 100}%`, left: `${-(x / width) * 100}%`, top: `${-(y / height) * 100}%` }} /></span>;
}

const wardrobeFits: Record<string, { x: number; y: number; size: number }> = {
  'explorer-bandana': { x: 50, y: 25, size: 34 }, 'coffee-scarf': { x: 50, y: 36, size: 28 }, 'focus-headphones': { x: 50, y: 23, size: 36 }, 'night-moon': { x: 61, y: 18, size: 14 }, 'voyage-cap': { x: 50, y: 18, size: 34 },
  'explorer-vest': { x: 50, y: 58, size: 48 }, 'coffee-apron': { x: 50, y: 60, size: 44 }, 'focus-jacket': { x: 50, y: 57, size: 52 }, 'night-cape': { x: 52, y: 58, size: 50 }, 'voyage-jacket': { x: 50, y: 57, size: 52 },
  'explorer-binoculars': { x: 60, y: 61, size: 30 }, 'coffee-dripper': { x: 70, y: 61, size: 24 }, 'focus-tablet': { x: 68, y: 58, size: 28 }, 'night-satchel': { x: 67, y: 61, size: 30 }, 'voyage-tag': { x: 68, y: 62, size: 20 },
  'explorer-compass': { x: 24, y: 50, size: 18 }, 'coffee-cup': { x: 25, y: 50, size: 16 }, 'focus-stylus': { x: 25, y: 48, size: 10 }, 'night-lantern': { x: 25, y: 53, size: 16 }, 'voyage-passport': { x: 25, y: 49, size: 14 },
};

const dollImageCache = new Map<string, Promise<HTMLImageElement>>();
const loadDollImage = (source: string) => {
  if (!dollImageCache.has(source)) dollImageCache.set(source, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  }));
  return dollImageCache.get(source)!;
};

const wardrobeFitFor = (item: WardrobeItem, partner: Partner) => {
  const fit = wardrobeFits[item.id] ?? AOZU_WARDROBE_SLOTS.find(({ id }) => id === item.slot)!;
  return partner.kind === 'human' ? { x: 50 + (fit.x - 50) * 0.68, y: fit.y * 0.84, size: fit.size * 0.72 } : fit;
};

function PaperDollCanvas({ partner, layers }: { partner: Partner; layers: { item: WardrobeItem; placement: Placement }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const sources = [...new Set([partner.image, ...layers.map(({ item }) => item.image)])];
      const images = new Map((await Promise.all(sources.map(async (source) => [source, await loadDollImage(source)] as const))));
      if (cancelled) return;
      const base = images.get(partner.image)!;
      const drawBase = () => context.drawImage(base, 0, 0, canvas.width, canvas.height);
      const drawLayer = ({ item, placement }: (typeof layers)[number]) => {
        const image = images.get(item.image)!;
        const [sourceX, sourceY, sourceWidth, sourceHeight] = item.crop;
        const fit = wardrobeFitFor(item, partner);
        const width = canvas.width * (fit.size / 100) * placement.scale;
        const height = width * sourceHeight / sourceWidth;
        const centerX = canvas.width * ((fit.x + placement.x) / 100);
        const centerY = canvas.height * ((fit.y + placement.y) / 100);
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, centerX - width / 2, centerY - height / 2, width, height);
      };

      context.clearRect(0, 0, canvas.width, canvas.height);
      layers.filter(({ item }) => item.slot === 'wardrobe-back').forEach(drawLayer);
      drawBase();
      layers.filter(({ item }) => item.slot !== 'wardrobe-back').forEach(drawLayer);

      context.save();
      context.beginPath();
      if (partner.kind === 'human') {
        context.ellipse(canvas.width * .5, canvas.height * .17, canvas.width * .12, canvas.height * .11, 0, 0, Math.PI * 2);
      } else {
        context.ellipse(canvas.width * .5, canvas.height * .3, canvas.width * .19, canvas.height * .15, 0, 0, Math.PI * 2);
        context.ellipse(canvas.width * .27, canvas.height * .49, canvas.width * .1, canvas.height * .09, 0, 0, Math.PI * 2);
        context.ellipse(canvas.width * .66, canvas.height * .55, canvas.width * .09, canvas.height * .09, 0, 0, Math.PI * 2);
      }
      context.clip();
      drawBase();
      context.restore();
    };
    void render();
    return () => { cancelled = true; };
  }, [layers, partner]);

  return <canvas ref={canvasRef} className="paper-doll-canvas" width="1024" height="1536" aria-label={`${partner.displayName}目前的完整穿搭`} />;
}

export default function Home() {
  const [runtime, setRuntime] = useState<AozuStartup | null>(null);
  const [runtimeError, setRuntimeError] = useState('');
  const [panel, setPanel] = useState<PanelId>('quests');
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>('travel');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [dataStatus, setDataStatus] = useState('');
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueIntent, setDialogueIntent] = useState<'module' | 'writing'>('module');
  const [adventureMode, setAdventureMode] = useState<AdventureMode | null>(null);
  const [placementDraft, setPlacementDraft] = useState<Record<string, Placement>>({});
  const [selectedWardrobeItemId, setSelectedWardrobeItemId] = useState('explorer-vest');
  const [magnetSlot, setMagnetSlot] = useState<AozuWardrobeSlotId | null>(null);
  const [wardrobeGhost, setWardrobeGhost] = useState<{ item: WardrobeItem; x: number; y: number; snapping: boolean } | null>(null);
  const [travelKind, setTravelKind] = useState<TravelKind>('spot');
  const [travelDay, setTravelDay] = useState<1 | 2 | 3>(1);
  const [travelInput, setTravelInput] = useState('');
  const [pendingPlace, setPendingPlace] = useState<{ name: string; kind: TravelKind; day: 1 | 2 | 3 } | null>(null);
  const [travelChat, setTravelChat] = useState<TravelChatMessage[]>([]);
  const [roomInput, setRoomInput] = useState('');
  const [roomMessage, setRoomMessage] = useState('');
  const [roomUserMessage, setRoomUserMessage] = useState('');
  const [agentProposal, setAgentProposal] = useState<AgentProposal | null>(null);
  const [savedMemories, setSavedMemories] = useState<SavedMemory[]>([]);
  const [savedCards, setSavedCards] = useState<SavedAbilityCard[]>([]);
  const [savedLifeRecords, setSavedLifeRecords] = useState<SavedLifeRecord[]>([]);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileConsoleOpen, setMobileConsoleOpen] = useState(false);
  const [consoleWidth, setConsoleWidth] = useState(31);
  const dragRef = useRef<{ pointerId: number; item: WardrobeItem; startX: number; startY: number; origin: Placement; current: Placement; moved: boolean; snapping: boolean } | null>(null);
  const closetDragRef = useRef<{ pointerId: number; item: WardrobeItem; startX: number; startY: number; moved: boolean; snapping: boolean } | null>(null);
  const suppressWardrobeClickRef = useRef(false);
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number; totalWidth: number } | null>(null);
  const toolPullRef = useRef<{ pointerId: number; startY: number; moved: boolean } | null>(null);
  const suppressToolClickRef = useRef(false);
  const paperDollRef = useRef<HTMLDivElement>(null);
  const partnerListRef = useRef<HTMLDivElement>(null);
  const mobilePartnerListRef = useRef<HTMLDivElement>(null);
  const travelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSavedMemories(readStoredList<SavedMemory>(AOZU_MEMORY_KEY));
      setSavedCards(readStoredList<SavedAbilityCard>(AOZU_CARD_KEY));
      setSavedLifeRecords(readStoredList<SavedLifeRecord>(AOZU_LIFE_KEY));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      try {
        const { application } = await bootAozu();
        const startup = await application.loadStartup();
        if (mounted && startup.status === 'main') {
          setRuntime(startup);
          setRuntimeError('');
        }
      } catch (error) {
        if (mounted) setRuntimeError(messageFrom(error));
      }
    };
    void sync();
    window.addEventListener('companion-updated', sync);
    return () => {
      mounted = false;
      window.removeEventListener('companion-updated', sync);
    };
  }, []);

  useEffect(() => {
    const onUiCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string; activity?: string; message?: string; proposal?: unknown }>).detail ?? {};
      if (detail.command === 'stage-proposal') {
        const proposal = detail.proposal as AgentProposal | undefined;
        if (!proposal || typeof proposal.id !== 'string' || !['life', 'travel', 'outfit', 'memory', 'card'].includes(proposal.kind)) return;
        setAgentProposal(proposal);
        if (proposal.kind === 'life') setActiveModuleId(proposal.activity);
        if (proposal.kind === 'travel') setActiveModuleId('travel');
        if (proposal.kind === 'outfit') setSelectedWardrobeItemId(proposal.itemId);
        setDialogueIntent('module');
        setDialogueOpen(true);
        setRoomMessage(proposal.dialogue || '我和 Agent 整理出一個冒險提案。你確認以前，我不會改變紀錄、穿搭、記憶或卡片。');
        setMobileConsoleOpen(false);
        setMobileToolsOpen(false);
        return;
      }
      if (detail.command === 'open-dialogue') {
        setDialogueOpen(true);
        if (detail.message) setRoomMessage(detail.message);
        return;
      }
      if (detail.command !== 'start-activity') return;
      if (detail.activity === 'room-shooter' || detail.activity === 'forest-runner') {
        setAdventureMode(detail.activity === 'room-shooter' ? 'room' : 'forest');
        setDialogueOpen(false);
        setMobileConsoleOpen(false);
        setMobileToolsOpen(false);
        return;
      }
      if (detail.activity === 'writing') {
        setDialogueIntent('writing');
        setRoomMessage(detail.message || '把想一起寫的段落、角色設定或靈感貼給我，我會陪你接著寫並保存在這台裝置。');
      } else {
        const nextModule = modules.find(({ id }) => id === detail.activity);
        if (nextModule) {
          setDialogueIntent('module');
          setActiveModuleId(nextModule.id);
          setRoomMessage(detail.message || conversationGuides[nextModule.id].intro);
        }
      }
      setAgentProposal(null);
      setDialogueOpen(true);
      setMobileConsoleOpen(false);
      setMobileToolsOpen(false);
    };
    window.addEventListener('aozu-ui-command', onUiCommand);
    return () => window.removeEventListener('aozu-ui-command', onUiCommand);
  }, []);

  const activeModule = modules.find(({ id }) => id === activeModuleId) ?? modules[3];
  const activePartner = AOZU_PARTNERS.find(({ name }) => name === runtime?.companion.name) ?? AOZU_PARTNERS[0];
  const wardrobeEnabled = true;
  const storedWardrobeItems = wardrobeEnabled ? AOZU_WARDROBE_ITEMS.filter(({ id }) => runtime?.loadout.equippedDefinitionIds.includes(`wardrobe-${id}`)) : [];
  const hasLegacyStarterWardrobe = storedWardrobeItems.length === legacyStarterWardrobe.length && legacyStarterWardrobe.every((id) => storedWardrobeItems.some((item) => item.id === id));
  const equippedWardrobeItems = hasLegacyStarterWardrobe ? [] : storedWardrobeItems;
  const selectedWardrobeItem = AOZU_WARDROBE_ITEMS.find(({ id }) => id === selectedWardrobeItemId) ?? equippedWardrobeItems[0] ?? AOZU_WARDROBE_ITEMS[0];
  const selectedWardrobePlacement = placementDraft[`wardrobe-${selectedWardrobeItem.id}`] ?? placementFrom(runtime?.loadout.itemStates[`wardrobe-${selectedWardrobeItem.id}`]);
  const equippedWardrobeLabel = equippedWardrobeItems.map(({ label }) => label).join('、') || '原本造型';
  const activeGuide = conversationGuides[activeModule.id];
  const travelJournal = (runtime?.loadout.itemStates['travel-journal'] as TravelJournalState | undefined) ?? DEFAULT_TRAVEL_JOURNAL;
  const travelScore = Object.values(travelJournal.points).reduce((total, value) => total + value, 0);
  const hasLegacyTravelBadge = travelJournal.equippedAccessoryId === 'route-pin'
    && travelJournal.points.exploration === 12 && travelJournal.points.taste === 8
    && travelJournal.points.planning === 10 && travelJournal.points.bond === 4;
  const activeTravelAccessory = hasLegacyTravelBadge ? undefined : AOZU_TRAVEL_ACCESSORIES.find(({ id }) => id === travelJournal.equippedAccessoryId);
  const activeTravelAccessoryName = activeTravelAccessory?.names[activePartner.id];
  const nextTravelAccessory = AOZU_TRAVEL_ACCESSORIES.find(({ threshold }) => threshold > travelScore);
  const completedStops = travelJournal.entries.filter(({ checked }) => checked).length;
  const activeSavedMemories = savedMemories.filter(({ partnerId }) => partnerId === activePartner.id).slice().reverse();
  const activeSavedCards = savedCards.filter(({ partnerId }) => partnerId === activePartner.id).slice().reverse();
  const activeLifeRecords = savedLifeRecords.filter(({ partnerId }) => partnerId === activePartner.id).slice().reverse();

  const refresh = async (application: Application) => {
    const startup = await application.loadStartup();
    if (startup.status === 'main') setRuntime(startup);
  };

  const runAction = async (actionId: string, success: string, idempotencyKey?: string) => {
    if (!runtime || busy) return false;
    setBusy(true);
    setRuntimeError('');
    try {
      const { application } = await bootAozu();
      await application.submitAction(actionId, runtime.stage.revision, idempotencyKey);
      await refresh(application);
      setToast(success);
      window.setTimeout(() => setToast(''), 1800);
      return true;
    } catch (error) {
      setRuntimeError(messageFrom(error));
      const { application } = await bootAozu();
      await refresh(application);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const switchPartner = async (partner: (typeof AOZU_PARTNERS)[number]) => {
    if (!runtime || partner.name === runtime.companion.name || busy) return;
    const saved = runtime.savedCompanions.filter(({ name }) => name === partner.name).at(-1);
    if (!saved) return;
    setBusy(true);
    try {
      const { application } = await bootAozu();
      await application.activateCompanion(saved.bundleId);
      await refresh(application);
      setDialogueOpen(false);
      setAdventureMode(null);
      setPendingPlace(null);
      setTravelChat([]);
      setTravelInput('');
      setRoomInput('');
      setRoomMessage('');
      setRoomUserMessage('');
      setAgentProposal(null);
      setMobileToolsOpen(false);
      setToast(`${partner.displayName}來到房間了`);
      window.setTimeout(() => setToast(''), 1800);
    } catch (error) {
      setRuntimeError(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const placementFor = (item: WardrobeItem) => placementDraft[`wardrobe-${item.id}`] ?? placementFrom(runtime?.loadout.itemStates[`wardrobe-${item.id}`]);

  const updatePlacement = (item: WardrobeItem, next: Placement) => {
    setPlacementDraft((drafts) => ({ ...drafts, [`wardrobe-${item.id}`]: next }));
  };

  const beginWardrobeLayerDrag = (item: WardrobeItem, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (panel !== 'wardrobe' || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedWardrobeItemId(item.id);
    const origin = placementFor(item);
    dragRef.current = { pointerId: event.pointerId, item, startX: event.clientX, startY: event.clientY, origin, current: origin, moved: false, snapping: false };
  };

  const moveWardrobeLayer = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    const bounds = paperDollRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
    const next = {
      x: clamp(drag.origin.x + ((event.clientX - drag.startX) / bounds.width) * 100, -35, 35),
      y: clamp(drag.origin.y + ((event.clientY - drag.startY) / bounds.height) * 100, -35, 35),
      scale: drag.origin.scale,
    };
    drag.moved = Math.abs(event.clientX - drag.startX) > 2 || Math.abs(event.clientY - drag.startY) > 2;
    drag.snapping = Math.hypot(next.x, next.y) < 13;
    drag.current = next;
    setMagnetSlot(drag.snapping ? drag.item.slot : null);
    updatePlacement(drag.item, next);
  };

  const savePlacement = async (item: WardrobeItem, next: Placement) => {
    if (!runtime || busy) return;
    setBusy(true);
    try {
      const { application } = await bootAozu();
      await application.setItemState(`wardrobe-${item.id}`, next, runtime.stage.revision);
      await refresh(application);
      setToast(`${item.label}${next.x === 0 && next.y === 0 ? '已磁吸就位' : '位置已保存'}`);
      window.setTimeout(() => setToast(''), 1800);
    } catch (error) {
      setRuntimeError(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const finishWardrobeLayerDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setMagnetSlot(null);
    const next = drag.snapping ? defaultPlacement : drag.current;
    updatePlacement(drag.item, next);
    if (drag.moved) void savePlacement(drag.item, next);
  };

  const equipWardrobeItem = (item: WardrobeItem) => {
    setSelectedWardrobeItemId(item.id);
    void runAction(`wear-${item.id}`, `${item.label}已磁吸到${AOZU_WARDROBE_SLOTS.find(({ id }) => id === item.slot)?.label}`);
  };

  const beginClosetDrag = (item: WardrobeItem, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!runtime || busy || !wardrobeEnabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    closetDragRef.current = { pointerId: event.pointerId, item, startX: event.clientX, startY: event.clientY, moved: false, snapping: false };
    setWardrobeGhost({ item, x: event.clientX, y: event.clientY, snapping: false });
  };

  const moveClosetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = closetDragRef.current;
    const bounds = paperDollRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
    drag.moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
    drag.snapping = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    setMagnetSlot(drag.snapping ? drag.item.slot : null);
    setWardrobeGhost({ item: drag.item, x: event.clientX, y: event.clientY, snapping: drag.snapping });
  };

  const finishClosetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = closetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    closetDragRef.current = null;
    suppressWardrobeClickRef.current = drag.moved;
    setWardrobeGhost(null);
    setMagnetSlot(null);
    if (drag.snapping) equipWardrobeItem(drag.item);
    window.setTimeout(() => { suppressWardrobeClickRef.current = false; }, 0);
  };

  const persistTravelJournal = async (next: TravelJournalState, idempotencyKey?: string) => {
    if (!runtime || busy) return false;
    setBusy(true);
    setRuntimeError('');
    try {
      const { application } = await bootAozu();
      await application.setItemState('travel-journal', next, runtime.stage.revision, idempotencyKey);
      await refresh(application);
      return true;
    } catch (error) {
      setRuntimeError(messageFrom(error));
      const { application } = await bootAozu();
      await refresh(application);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clearLegacyStarterLayers = async () => {
    if (!runtime || busy || (!hasLegacyStarterWardrobe && !hasLegacyTravelBadge)) return;
    setBusy(true);
    try {
      const { application } = await bootAozu();
      let current = runtime;
      if (hasLegacyStarterWardrobe) {
        for (const slot of AOZU_WARDROBE_SLOTS) {
          await application.submitAction(`clear-${slot.id}`, current.stage.revision);
          const next = await application.loadStartup();
          if (next.status === 'main') current = next;
        }
      }
      if (hasLegacyTravelBadge) {
        await application.setItemState('travel-journal', { ...travelJournal, equippedAccessoryId: 'none' }, current.stage.revision);
        const next = await application.loadStartup();
        if (next.status === 'main') current = next;
      }
      setRuntime(current);
    } catch (error) {
      setRuntimeError(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const openTravelChat = () => {
    setPanel('quests');
    setActiveModuleId('travel');
    setDialogueIntent('module');
    const mobile = isMobileViewport();
    setDialogueOpen(!mobile);
    setRoomMessage(conversationGuides.travel.intro);
    setMobileConsoleOpen(false);
    if (mobile) {
      setToast(`點一下${activePartner.displayName}開始旅行通話`);
      window.setTimeout(() => setToast(''), 1800);
    }
  };

  const selectLifeControl = (control: (typeof lifeControls)[number]) => {
    setPanel(control.panel);
    setMobileToolsOpen(false);
    setMobileConsoleOpen(false);
    if (!control.module) {
      void clearLegacyStarterLayers();
      return;
    }
    setDialogueIntent('module');
    const mobile = isMobileViewport();
    setDialogueOpen(!mobile);
    setMobileConsoleOpen(false);
    setActiveModuleId(control.module);
    setRoomMessage(conversationGuides[control.module].intro);
    if (mobile) {
      setToast(`已切換${control.label}，點一下${activePartner.displayName}開始對話`);
      window.setTimeout(() => setToast(''), 1800);
    }
  };

  const openPetDialogue = () => {
    setMobileToolsOpen(false);
    setMobileConsoleOpen(false);
    if (!roomMessage) setRoomMessage(dialogueIntent === 'writing' ? '把想一起寫的內容貼給我。' : activeGuide.intro);
    setDialogueOpen(true);
  };

  const openPanel = (nextPanel: PanelId) => {
    setPanel(nextPanel);
    setDialogueOpen(false);
    setMobileToolsOpen(false);
    setMobileConsoleOpen(nextPanel !== 'wardrobe');
    if (nextPanel === 'wardrobe') void clearLegacyStarterLayers();
  };

  const beginToolPull = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    toolPullRef.current = { pointerId: event.pointerId, startY: event.clientY, moved: false };
  };

  const moveToolPull = (event: ReactPointerEvent<HTMLElement>) => {
    const pull = toolPullRef.current;
    if (!pull || pull.pointerId !== event.pointerId) return;
    const distance = event.clientY - pull.startY;
    if (Math.abs(distance) < 26) return;
    pull.moved = true;
    suppressToolClickRef.current = true;
    setMobileToolsOpen(distance < 0);
  };

  const finishToolPull = (event: ReactPointerEvent<HTMLElement>) => {
    if (toolPullRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    toolPullRef.current = null;
  };

  const toggleTools = () => {
    if (suppressToolClickRef.current) {
      suppressToolClickRef.current = false;
      return;
    }
    setMobileToolsOpen((open) => !open);
  };

  const beginConsoleResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: consoleWidth, totalWidth: bounds.width };
  };

  const moveConsoleResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setConsoleWidth(clamp(resize.startWidth + ((resize.startX - event.clientX) / resize.totalWidth) * 100, 26, 40));
  };

  const finishConsoleResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeRef.current = null;
  };

  const sendTravelMessage = async (value: string) => {
    if (!value || busy) return;
    setRoomUserMessage(value);

    if (!pendingPlace) {
      const pending = { name: value, kind: travelKind, day: travelDay };
      const reply = `「${value}」記下來了。它在什麼位置、哪一區，或靠近哪個地標？`;
      setPendingPlace(pending);
      setTravelChat((messages) => [...messages,
        { id: `user-${Date.now()}`, from: 'user', text: value },
        { id: `partner-${Date.now()}`, from: 'partner', text: reply },
      ]);
      setRoomMessage(reply);
      setTravelInput('');
      setRoomInput('');
      return;
    }

    const entry = {
      id: `stop-${Date.now().toString(36)}`,
      day: pendingPlace.day,
      kind: pendingPlace.kind,
      name: pendingPlace.name,
      location: value,
      checked: false,
    } as const;
    const points = { ...travelJournal.points, planning: travelJournal.points.planning + 6, bond: travelJournal.points.bond + 1 };
    if (entry.kind === 'spot') points.exploration += 8;
    else points.taste += 8;
    const saved = await persistTravelJournal({ ...travelJournal, entries: [...travelJournal.entries, entry], points });
    if (!saved) return;

    const reply = `完成！我把「${entry.name}」排進第 ${entry.day} 天手札。規劃 +6、${entry.kind === 'food' ? '品味' : '探索'} +8、羈絆 +1。`;
    setTravelChat((messages) => [...messages,
      { id: `user-${Date.now()}`, from: 'user', text: value },
      { id: `partner-${Date.now()}`, from: 'partner', text: reply },
    ]);
    setRoomMessage(reply);
    setPendingPlace(null);
    setTravelInput('');
    setRoomInput('');
    setToast(`${entry.name}已加入旅行手札`);
    window.setTimeout(() => setToast(''), 2200);
  };

  const submitTravelChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendTravelMessage(travelInput.trim());
  };

  const submitRoomChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = roomInput.trim();
    if (!value || busy) return;
    if (dialogueIntent === 'writing') {
      const key = 'aozu:shared-writing';
      let notes: { text: string; partner: string; createdAt: number }[] = [];
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
        notes = Array.isArray(saved) ? saved : [];
      } catch { notes = []; }
      notes.push({ text: value, partner: activePartner.displayName, createdAt: Date.now() });
      localStorage.setItem(key, JSON.stringify(notes.slice(-100)));
      setRoomUserMessage(value);
      setRoomInput('');
      setRoomMessage(`這段我收進共同文字了。我們已經一起留下 ${notes.length} 段內容；你可以再貼一段，我會繼續陪你寫。`);
      return;
    }
    if (activeModule.id === 'travel') {
      await sendTravelMessage(value);
      return;
    }
    setRoomUserMessage(value);
    setRoomInput('');
    setRoomMessage(activeGuide.done);
    await runAction(activeModule.id, `${activeModule.label}已寫進共同記憶`);
  };

  const toggleJournalEntry = async (entryId: string) => {
    const current = travelJournal.entries.find(({ id }) => id === entryId);
    if (!current) return;
    const direction = current.checked ? -1 : 1;
    const points = { ...travelJournal.points, bond: Math.max(0, travelJournal.points.bond + direction * 3) };
    if (current.kind === 'spot') points.exploration = Math.max(0, points.exploration + direction * 8);
    else points.taste = Math.max(0, points.taste + direction * 8);
    const saved = await persistTravelJournal({
      ...travelJournal,
      entries: travelJournal.entries.map((entry) => entry.id === entryId ? { ...entry, checked: !entry.checked } : entry),
      points,
    });
    if (saved) setToast(current.checked ? '已恢復為待完成' : `完成 ${current.name}，能力點數已更新`);
  };

  const equipTravelAccessory = async (accessoryId: (typeof AOZU_TRAVEL_ACCESSORIES)[number]['id']) => {
    const accessory = AOZU_TRAVEL_ACCESSORIES.find(({ id }) => id === accessoryId);
    if (!accessory || travelScore < accessory.threshold) return;
    const saved = await persistTravelJournal({ ...travelJournal, equippedAccessoryId: accessoryId });
    if (saved) setToast(`已裝備${accessory.names[activePartner.id]}`);
  };

  const rejectAgentProposal = () => {
    setAgentProposal(null);
    setRoomMessage('好，這次先不採用。Agent 的提案沒有改變任何 AOZU 資料。');
    setToast('提案已捨棄');
  };

  const confirmAgentProposal = async () => {
    const proposal = agentProposal;
    if (!proposal || busy) return;
    if (proposal.kind === 'life') {
      const saved = await runAction(proposal.activity, '生活冒險已完成並累積成長', proposal.id);
      if (!saved) return;
      const record: SavedLifeRecord = { id: proposal.id, partnerId: activePartner.id, activity: proposal.activity, summary: proposal.summary, createdAt: Date.now() };
      setSavedLifeRecords((current) => saveStoredList(AOZU_LIFE_KEY, current, record));
      setPanel('memories');
      setRoomMessage(`完成！「${proposal.summary}」已成為我們共同完成的生活冒險。`);
    }
    if (proposal.kind === 'travel') {
      const knownIds = new Set(travelJournal.entries.map(({ id }) => id));
      const room = Math.max(0, 60 - travelJournal.entries.length);
      const additions = proposal.stops.slice(0, room).map((stop, index) => ({ ...stop, id: `agent-${proposal.id.slice(0, 50)}-${index}`, checked: false })).filter(({ id }) => !knownIds.has(id));
      if (!additions.length) { setRuntimeError('旅行手札已滿，或這份 Agent 提案已經加入。'); return; }
      const points = { ...travelJournal.points, planning: travelJournal.points.planning + 6, bond: travelJournal.points.bond + 1 };
      for (const stop of additions) points[stop.kind === 'food' ? 'taste' : 'exploration'] += 8;
      const saved = await persistTravelJournal({ ...travelJournal, title: proposal.title, entries: [...travelJournal.entries, ...additions], points }, proposal.id);
      if (!saved) return;
      setPanel('journal');
      setRoomMessage(`完成！${additions.length} 個地點已寫進「${proposal.title}」，能力點數也已更新。`);
    }
    if (proposal.kind === 'outfit') {
      const item = AOZU_WARDROBE_ITEMS.find(({ id }) => id === proposal.itemId);
      if (!item) return;
      setSelectedWardrobeItemId(item.id);
      const saved = await runAction(`wear-${item.id}`, `${item.label}已穿到${activePartner.displayName}身上`, proposal.id);
      if (!saved) return;
      setPanel('wardrobe');
      setRoomMessage(`穿好了！${item.label}已經成為我現在造型的一部分。`);
    }
    if (proposal.kind === 'memory') {
      const memory: SavedMemory = { id: proposal.id, partnerId: activePartner.id, title: proposal.title, summary: proposal.summary, category: proposal.category, createdAt: Date.now() };
      setSavedMemories((current) => saveStoredList(AOZU_MEMORY_KEY, current, memory));
      setPanel('memories');
      setRoomMessage(`我記住「${proposal.title}」了；它只保存在這台裝置，也可以由你決定忘記。`);
      setToast('共同記憶已保存');
    }
    if (proposal.kind === 'card') {
      const card: SavedAbilityCard = { id: proposal.id, partnerId: activePartner.id, title: proposal.title, ability: proposal.ability, summary: proposal.summary, requiredCapabilities: proposal.requiredCapabilities, createdAt: Date.now() };
      setSavedCards((current) => saveStoredList(AOZU_CARD_KEY, current, card));
      setPanel('cards');
      setRoomMessage(`「${proposal.title}」已封成能力卡。下次可以直接從卡片叫回這項技能。`);
      setToast('新的能力卡已封存');
    }
    setAgentProposal(null);
    window.setTimeout(() => setToast(''), 2200);
  };

  const recallAbilityCard = (card: SavedAbilityCard) => {
    setAgentProposal(null);
    setDialogueIntent('module');
    setDialogueOpen(true);
    setMobileConsoleOpen(false);
    setRoomMessage(`已召喚「${card.title}」。我會使用「${card.ability}」陪你開始下一段冒險；${card.summary}`);
  };

  const exportCompanion = async () => {
    setDataStatus('正在打包本機記憶…');
    try {
      const { application } = await bootAozu();
      const blob = await application.exportData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `aozu-${activePartner.id}-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      setDataStatus('這位夥伴的記憶已匯出');
    } catch (error) {
      setDataStatus(`匯出失敗：${messageFrom(error)}`);
    }
  };

  const importCompanion = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setDataStatus('正在驗證夥伴記憶…');
    try {
      const { application } = await bootAozu();
      const preview = await application.prepareImport(file);
      if (!window.confirm(`啟用「${preview.name}」？\n資料已通過完整性與資產驗證。`)) {
        setDataStatus('記憶已驗證，但沒有啟用');
        return;
      }
      await application.approveCandidate(preview.bundleId, true);
      await refresh(application);
      setDataStatus(`已啟用 ${preview.name}`);
    } catch (error) {
      setDataStatus(`匯入失敗：${messageFrom(error)}`);
    } finally {
      input.value = '';
    }
  };

  return (
    <div className="game-app" style={{ '--partner-accent': activePartner.accent } as CSSProperties}>
      <header className="game-topbar">
        <div className="game-brand"><img src="/assets/aotter-logo-red.svg" alt="Aotter" /><span>AOZU</span><small>OMNILIFE COMPANION</small></div>
        <div className="player-hud"><span className="connection-dot" /><b>{runtime ? 'COMPANION ONLINE' : runtimeError ? 'CORE ERROR' : '召喚夥伴中'}</b><span className="shell-count">◒ <strong>1,280</strong></span><span className="player-avatar">K</span></div>
      </header>

      <main className="game-world" style={{ '--console-width': `${consoleWidth}%` } as CSSProperties}>
        <section className={`companion-room ${mobileToolsOpen ? 'is-tools-open' : ''} ${panel === 'wardrobe' && wardrobeEnabled && !mobileConsoleOpen ? 'is-wardrobe' : ''}`} aria-label={`${activePartner.displayName}的夥伴房間`}>
          <picture className="room-background"><img src="/assets/mascot-club-room-v1.webp" alt="暖光夥伴房間" /></picture>
          <div className="room-light" />
          {adventureMode && <AdventureGame key={adventureMode} mode={adventureMode} partner={activePartner} onClose={() => setAdventureMode(null)} />}

          <div className="partner-switcher-shell">
            <button className="partner-slider-arrow is-left" type="button" aria-label="向左瀏覽夥伴" onClick={() => partnerListRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}>‹</button>
            <div ref={partnerListRef} className="partner-switcher" aria-label="切換虛擬夥伴">
              <span className="switcher-title">夥伴卡</span>
              {AOZU_PARTNERS.map((partner) => (
                <button key={partner.id} className={partner.id === activePartner.id ? 'partner-card is-active' : 'partner-card'} type="button" disabled={!runtime || busy} onClick={() => switchPartner(partner)} aria-pressed={partner.id === activePartner.id} aria-label={`切換成${partner.displayName}`}>
                  <PartnerHeadshot partner={partner} decorative /><span>{partner.displayName}</span><i style={{ background: partner.accent }} />
                </button>
              ))}
            </div>
            <button className="partner-slider-arrow is-right" type="button" aria-label="向右瀏覽夥伴" onClick={() => partnerListRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}>›</button>
          </div>

          <div className="mission-hud">
            <span className="mission-kicker">{activeModule.category} ・ TODAY QUEST</span>
            <strong>{activeModule.label}｜{activeModule.value}</strong>
            <small>{activeModule.note}</small>
            <button type="button" disabled={!runtime || busy} onClick={activeModule.id === 'travel' ? openTravelChat : () => runAction(activeModule.id, `${activeModule.label}已寫進共同記憶`)}>{busy ? '處理中…' : activeModule.id === 'travel' ? '開始對話' : activeModule.action}</button>
          </div>

          {!dialogueOpen && <button className="chat-launcher" type="button" onClick={() => { setDialogueIntent('module'); setRoomMessage(activeGuide.intro); setDialogueOpen(true); }} aria-label={`跟${activePartner.displayName}對話`}><span><PartnerHeadshot partner={activePartner} decorative /></span><b>跟我說話</b></button>}
          {dialogueOpen && <form className="room-chat" onSubmit={submitRoomChat}>
            <button className="room-chat-close" type="button" onClick={() => setDialogueOpen(false)} aria-label="收起對話">×</button>
            <span className="room-call-status"><i />與{activePartner.displayName}通話中</span>
            <div className="room-chat-message"><span className="room-chat-avatar"><PartnerHeadshot partner={activePartner} decorative /></span><p><strong>{activePartner.displayName}</strong>{roomMessage || (dialogueIntent === 'writing' ? '把想一起寫的內容貼給我。' : activeGuide.intro)}</p></div>
            {roomUserMessage && <small className="room-user-echo">你說：{roomUserMessage}</small>}
            {agentProposal && <section className="agent-proposal-card" aria-label="WebMCP Agent 提案">
              <span>WEBMCP 冒險提案</span><strong>{agentProposalTitle(agentProposal)}</strong><p>{agentProposalSummary(agentProposal)}</p>
              {agentProposal.kind === 'travel' && <ul>{agentProposal.stops.map((stop, index) => <li key={`${stop.name}-${index}`}><b>DAY {stop.day}</b><span>{stop.name}</span><small>{stop.location}</small></li>)}</ul>}
              {agentProposal.kind === 'outfit' && <div className="agent-outfit-preview"><WardrobeSprite item={AOZU_WARDROBE_ITEMS.find(({ id }) => id === agentProposal.itemId) ?? AOZU_WARDROBE_ITEMS[0]} /><small>紙娃娃會重新合成，不只是把圖貼在角色上。</small></div>}
              {agentProposal.kind === 'card' && <small>需要能力：{agentProposal.requiredCapabilities.join('、') || 'AOZU 本機能力'}</small>}
              <em>確認以前不會改變角色資料。</em><div><button type="button" onClick={rejectAgentProposal}>先不要</button><button type="button" disabled={busy} onClick={() => void confirmAgentProposal()}>{busy ? '處理中…' : '確認一起做'}</button></div>
            </section>}
            {!agentProposal && <div className="room-chat-composer"><input value={roomInput} maxLength={dialogueIntent === 'writing' ? 1000 : 120} onChange={(event) => setRoomInput(event.target.value)} placeholder={dialogueIntent === 'writing' ? '貼上段落、角色設定或下一句靈感' : pendingPlace && activeModule.id === 'travel' ? '貼上位置或附近地標' : activeGuide.placeholder} /><button type="submit" disabled={!runtime || busy || !roomInput.trim()} aria-label={`送出給${activePartner.displayName}`}>送出</button></div>}
          </form>}

          <div ref={paperDollRef} className={`paper-doll partner-${activePartner.kind} ${panel === 'wardrobe' && wardrobeEnabled ? 'is-editing' : ''}`} aria-label={`${activePartner.displayName}，${equippedWardrobeLabel}${activeTravelAccessoryName ? `，${activeTravelAccessoryName}` : ''}`}>
            <PartnerArt partner={activePartner} className="doll-base doll-fallback" />
            <PaperDollCanvas partner={activePartner} layers={equippedWardrobeItems.map((item) => ({ item, placement: placementFor(item) }))} />
            <button className="mobile-pet-dialogue-hitbox" type="button" onClick={openPetDialogue} disabled={!runtime} aria-label={`點${activePartner.displayName}開始對話`} />
            {panel === 'wardrobe' && wardrobeEnabled && AOZU_WARDROBE_SLOTS.map((slot) => <span key={slot.id} className={`snap-target snap-${slot.id} ${magnetSlot === slot.id ? 'is-magnetic' : ''}`} style={{ '--slot-x': `${slot.x}%`, '--slot-y': `${slot.y}%` } as CSSProperties}><i />{slot.label}</span>)}
            {equippedWardrobeItems.map((item) => {
              const fit = wardrobeFitFor(item, activePartner);
              const itemPlacement = placementFor(item);
              return <span key={item.id} className={`doll-item doll-drag-handle slot-${item.slot} ${selectedWardrobeItem.id === item.id ? 'is-selected' : ''}`} style={{ '--slot-x': `${fit.x}%`, '--slot-y': `${fit.y}%`, '--slot-size': `${fit.size}%`, '--item-x': `${itemPlacement.x}%`, '--item-y': `${itemPlacement.y}%`, '--item-scale': itemPlacement.scale, aspectRatio: `${item.crop[2]} / ${item.crop[3]}` } as CSSProperties} onPointerDown={(event) => beginWardrobeLayerDrag(item, event)} onPointerMove={moveWardrobeLayer} onPointerUp={finishWardrobeLayerDrag} onPointerCancel={finishWardrobeLayerDrag} aria-label={`拖曳${item.label}`} />;
            })}
          </div>

          {panel === 'wardrobe' && wardrobeEnabled && equippedWardrobeItems.some(({ id }) => id === selectedWardrobeItem.id) && <div className="placement-editor" aria-label="物件位置控制器">
            <div><strong>{selectedWardrobeItem.label}</strong><small>拖回對應光圈就會磁吸就位</small></div>
            <label><span>大小</span><input type="range" min="0.7" max="1.3" step="0.05" value={selectedWardrobePlacement.scale} onChange={(event) => updatePlacement(selectedWardrobeItem, { ...selectedWardrobePlacement, scale: Number(event.target.value) })} /></label>
            <button type="button" onClick={() => updatePlacement(selectedWardrobeItem, defaultPlacement)}>吸回原位</button>
            <button className="save-placement" type="button" disabled={busy} onClick={() => void savePlacement(selectedWardrobeItem, placementFor(selectedWardrobeItem))}>{busy ? '保存中…' : '固定'}</button>
          </div>}

          {panel === 'wardrobe' && wardrobeEnabled && !mobileConsoleOpen && <section className="room-wardrobe-tray" aria-label="可拖曳物件列">
            <header><div><span>MAGNETIC ITEMS</span><strong>把物件拖到{activePartner.displayName}身上</strong></div><button type="button" onClick={() => setPanel('quests')}>完成</button></header>
            <div className="room-wardrobe-items">{AOZU_WARDROBE_ITEMS.map((item) => {
              const isEquipped = equippedWardrobeItems.some(({ id }) => id === item.id);
              return <button key={item.id} className={`room-wardrobe-item ${isEquipped ? 'is-equipped' : ''}`} type="button" disabled={!runtime || busy} aria-pressed={isEquipped} onClick={() => { if (!suppressWardrobeClickRef.current) equipWardrobeItem(item); }} onPointerDown={(event) => beginClosetDrag(item, event)} onPointerMove={moveClosetDrag} onPointerUp={finishClosetDrag} onPointerCancel={finishClosetDrag}>
                <WardrobeSprite item={item} /><strong>{item.label}</strong><small>{isEquipped ? '已穿上・可拖動' : '拖到角色身上'}</small>
              </button>;
            })}</div>
          </section>}

          <div className="companion-profile">
            <PartnerHeadshot partner={activePartner} className="profile-headshot" /><div><strong>{activePartner.displayName}</strong><small>{activePartner.role} ・ 羈絆 76</small></div><b>Lv.12</b><i><span style={{ width: '76%' }} /></i>
          </div>

          <nav className="game-dock" aria-label="夥伴管理">
            {panels.map((item) => <button key={item.id} className={panel === item.id ? 'is-active' : ''} type="button" onClick={() => openPanel(item.id)}><span>{item.icon}</span>{item.label}</button>)}
          </nav>
          {panel !== 'wardrobe' && <button className="mobile-tools-toggle" type="button" aria-expanded={mobileToolsOpen} onClick={toggleTools} onPointerDown={beginToolPull} onPointerMove={moveToolPull} onPointerUp={finishToolPull} onPointerCancel={finishToolPull}>{mobileToolsOpen ? '收起' : '選單'}</button>}
          {mobileToolsOpen && <section className="mobile-tools-drawer" aria-label="夥伴工具">
            <div className="mobile-partner-carousel">
              <button className="mobile-partner-arrow is-left" type="button" aria-label="向左瀏覽夥伴" onClick={() => mobilePartnerListRef.current?.scrollBy({ left: -190, behavior: 'smooth' })}>‹</button>
              <div ref={mobilePartnerListRef} className="mobile-partner-strip">{AOZU_PARTNERS.map((partner) => <button key={partner.id} className={partner.id === activePartner.id ? 'is-active' : ''} type="button" disabled={!runtime || busy} onClick={() => switchPartner(partner)}><PartnerHeadshot partner={partner} decorative /><span>{partner.displayName}</span></button>)}</div>
              <button className="mobile-partner-arrow is-right" type="button" aria-label="向右瀏覽夥伴" onClick={() => mobilePartnerListRef.current?.scrollBy({ left: 190, behavior: 'smooth' })}>›</button>
            </div>
            <nav className="mobile-life-strip" aria-label="生活任務">{lifeControls.map((control) => <button key={control.id} type="button" onClick={() => selectLifeControl(control)}><b style={{ background: control.tone }}>{control.mark}</b>{control.label}</button>)}</nav>
            <nav className="mobile-panel-strip" aria-label="夥伴管理">{panels.map((item) => <button key={item.id} type="button" onClick={() => openPanel(item.id)}><b>{item.icon}</b>{item.label}</button>)}</nav>
          </section>}
          {wardrobeGhost && <span className={`wardrobe-drag-ghost ${wardrobeGhost.snapping ? 'is-snapping' : ''}`} style={{ left: wardrobeGhost.x, top: wardrobeGhost.y }}><WardrobeSprite item={wardrobeGhost.item} /></span>}
          {toast && <div className="game-toast" role="status">✓ {toast}</div>}
        </section>

        <button
          className={`console-resizer ${mobileConsoleOpen ? 'is-visible' : ''}`}
          type="button"
          role="separator"
          aria-label="調整聊天控制欄寬度"
          aria-orientation="vertical"
          aria-valuemin={26}
          aria-valuemax={40}
          aria-valuenow={Math.round(consoleWidth)}
          onDoubleClick={() => setConsoleWidth(31)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setConsoleWidth((width) => clamp(width + 1, 26, 40));
            if (event.key === 'ArrowRight') setConsoleWidth((width) => clamp(width - 1, 26, 40));
          }}
          onPointerDown={beginConsoleResize}
          onPointerMove={moveConsoleResize}
          onPointerUp={finishConsoleResize}
          onPointerCancel={finishConsoleResize}
        ><span>⋮</span></button>

        <aside className={`game-console ${panel === 'quests' && activeModuleId === 'travel' ? 'is-travel' : ''} ${mobileConsoleOpen ? 'is-mobile-open' : ''}`} aria-live="polite">
          <button className="mobile-console-close" type="button" onClick={() => setMobileConsoleOpen(false)} aria-label="關閉詳細面板">返回{activePartner.displayName}</button>
          <nav className="life-control-bar" aria-label="食衣住行育控制">
            {lifeControls.map((control) => {
              const active = control.panel === 'wardrobe' ? panel === 'wardrobe' : panel === 'quests' && activeModuleId === control.module;
              return <button key={control.id} className={active ? 'is-active' : ''} style={{ '--control-tone': control.tone } as CSSProperties} type="button" onClick={() => selectLifeControl(control)} aria-pressed={active}><span>{control.mark}</span><small>{control.label}</small></button>;
            })}
          </nav>
          {panel === 'quests' && <>
            <div className="console-heading"><div><span>{activeModuleId === 'travel' ? 'LIVE ROUTE CALL' : 'OMNILIFE QUEST'}</span><h1>{activeModuleId === 'travel' ? `和${activePartner.displayName}聊行程` : `${activeModule.category}・${activeModule.label}`}</h1></div><b>{activeModuleId === 'travel' ? `${travelScore} PTS` : activeModule.value}</b></div>
            {activeModuleId === 'travel' ? <section className="travel-chat" aria-label="旅行規劃對話">
              <div className="travel-chat-head"><span><i />夥伴通話中</span><button type="button" onClick={() => setPanel('journal')}>打開旅行手札</button></div>
              <div className="travel-chat-log" aria-live="polite">
                <article className="from-partner"><b><PartnerHeadshot partner={activePartner} decorative /></b><p><strong>{activePartner.displayName}</strong>把想去的景點或想吃的店告訴我，我會再問位置，排進三日行程並替我們累積能力點數。</p></article>
                {travelChat.map((message) => <article key={message.id} className={message.from === 'partner' ? 'from-partner' : 'from-user'}>{message.from === 'partner' && <b><PartnerHeadshot partner={activePartner} decorative /></b>}<p>{message.text}</p></article>)}
              </div>
              <div className="travel-skill-strip"><span>探索 <b>{travelJournal.points.exploration}</b></span><span>品味 <b>{travelJournal.points.taste}</b></span><span>規劃 <b>{travelJournal.points.planning}</b></span><span>羈絆 <b>{travelJournal.points.bond}</b></span></div>
              {!pendingPlace && <div className="travel-chat-options">
                <div><small>想加入</small><button type="button" className={travelKind === 'spot' ? 'is-active' : ''} onClick={() => setTravelKind('spot')}>景點</button><button type="button" className={travelKind === 'food' ? 'is-active' : ''} onClick={() => setTravelKind('food')}>餐廳</button></div>
                <div><small>排在</small>{([1, 2, 3] as const).map((day) => <button key={day} type="button" className={travelDay === day ? 'is-active' : ''} onClick={() => setTravelDay(day)}>第 {day} 天</button>)}</div>
              </div>}
              {pendingPlace && <div className="pending-place"><span>{pendingPlace.kind === 'food' ? '食' : '旅'}</span><p><strong>{pendingPlace.name}</strong><small>第 {pendingPlace.day} 天・等待位置</small></p><button type="button" onClick={() => { setPendingPlace(null); setTravelInput(''); }}>重選</button></div>}
              <form className="travel-composer" onSubmit={submitTravelChat}>
                <label><span>{pendingPlace ? '位置' : '對夥伴說'}</span><input ref={travelInputRef} value={travelInput} maxLength={pendingPlace ? 120 : 80} onChange={(event) => setTravelInput(event.target.value)} placeholder={pendingPlace ? '例如：中西區國華街，近永樂市場' : '例如：我想去林百貨／想吃阿裕牛肉湯'} /></label>
                <button type="submit" disabled={!runtime || busy || !travelInput.trim()} aria-label="送出旅行訊息">➤</button>
              </form>
            </section> : <section className="module-glass-card" style={{ '--module-tone': activeModule.color } as CSSProperties}>
              <span>{activeModule.icon}</span><div><small>{activePartner.displayName}的今日建議</small><h2>{activeModule.quest}</h2><p>{activeModule.note}</p><b>{activeModule.reward}</b></div><button type="button" disabled={!runtime || busy} onClick={() => runAction(activeModule.id, `${activeModule.label}已寫進共同記憶`)}>{busy ? '處理中…' : activeModule.action}</button>
            </section>}
          </>}

          {panel === 'wardrobe' && <>
            <div className="console-heading"><div><span>MAGNETIC CLOSET</span><h1>{activePartner.displayName}的物件櫃</h1></div><b>{equippedWardrobeItems.length} / 4</b></div>
            {!wardrobeEnabled && <div className="wardrobe-lock"><span>衣</span><strong>磁吸紙娃娃目前是布丁獺版型</strong><p>{activePartner.displayName}仍可裝備下方的專屬旅行配件；它們會隨手札能力點數逐一解鎖。</p></div>}
            {wardrobeEnabled && <div className="closet-slots">
              {AOZU_WARDROBE_SLOTS.map((slot) => {
                const items = AOZU_WARDROBE_ITEMS.filter((item) => item.slot === slot.id);
                const equipped = equippedWardrobeItems.find((item) => item.slot === slot.id);
                return <section key={slot.id} className="closet-slot">
                  <header><div><span>{slot.label}</span><strong>{equipped?.label ?? '尚未裝備'}</strong></div><button type="button" disabled={!runtime || busy || !equipped} onClick={() => void runAction(`clear-${slot.id}`, `已卸下${slot.label}物件`)}>卸下</button></header>
                  <div>{items.map((item) => {
                    const isEquipped = equipped?.id === item.id;
                    return <button key={item.id} className={`closet-item ${isEquipped ? 'is-equipped' : ''}`} type="button" disabled={!runtime || busy} aria-pressed={isEquipped} onClick={() => { if (!suppressWardrobeClickRef.current) equipWardrobeItem(item); }} onPointerDown={(event) => beginClosetDrag(item, event)} onPointerMove={moveClosetDrag} onPointerUp={finishClosetDrag} onPointerCancel={finishClosetDrag}>
                      <WardrobeSprite item={item} /><strong>{item.label}</strong><small>{isEquipped ? '已吸附' : '拖到角色或點一下'}</small>
                    </button>;
                  })}</div>
                </section>;
              })}
            </div>}
            <div className="accessory-section-heading"><div><span>TRAVEL REWARDS</span><h2>旅行配件</h2></div><small>{travelScore} 能力點</small></div>
            <div className="travel-accessory-grid">
              {AOZU_TRAVEL_ACCESSORIES.map((accessory) => {
                const unlocked = travelScore >= accessory.threshold;
                const equipped = travelJournal.equippedAccessoryId === accessory.id;
                return <button key={accessory.id} className={equipped ? 'is-equipped' : ''} type="button" disabled={!runtime || busy || !unlocked} onClick={() => equipTravelAccessory(accessory.id)} aria-pressed={equipped}>
                  <i>{accessory.icon}</i><strong>{accessory.names[activePartner.id]}</strong><small>{equipped ? '裝備中' : unlocked ? '點一下裝備' : `${accessory.threshold - travelScore} 點後解鎖`}</small><span>{accessory.skill}</span>
                </button>;
              })}
            </div>
            <div className="closet-note"><span>✓</span><p><strong>{wardrobeEnabled ? '四個部位各自磁吸，同類新物件會自動替換舊物件' : '每位夥伴都有三件專屬旅行配件'}</strong>可從物件櫃拖到角色身上，也可穿好後再拖曳調整；靠近光圈就會自動吸附。</p></div>
          </>}

          {panel === 'journal' && <>
            <div className="console-heading"><div><span>TRAVEL FIELD NOTES</span><h1>旅行手札</h1></div><b>{completedStops} / {travelJournal.entries.length}</b></div>
            <section className="journal-cover">
              <div><span>與 {activePartner.displayName} 共筆</span><h2>{travelJournal.title}</h2><p>景點、餐廳與位置都保存在這位夥伴的 Companion 記憶裡。</p></div>
              <button type="button" onClick={openTravelChat}>＋ 繼續對話規劃</button>
            </section>
            <div className="journal-skills">
              <article><span>探索</span><strong>{travelJournal.points.exploration}</strong></article><article><span>品味</span><strong>{travelJournal.points.taste}</strong></article><article><span>規劃</span><strong>{travelJournal.points.planning}</strong></article><article><span>羈絆</span><strong>{travelJournal.points.bond}</strong></article>
            </div>
            <section className="reward-progress">
              <div><span>{activeTravelAccessory?.icon ?? '○'}</span><p><strong>{activeTravelAccessoryName ?? '尚未裝備旅行配件'}</strong><small>{nextTravelAccessory ? `下一件「${nextTravelAccessory.names[activePartner.id]}」還差 ${nextTravelAccessory.threshold - travelScore} 點` : '三件旅行配件已全部解鎖'}</small></p><b>{travelScore} PTS</b></div>
              <i><span style={{ width: `${Math.min(100, travelScore)}%` }} /></i>
            </section>
            <div className="itinerary-days">
              {([1, 2, 3] as const).map((day) => {
                const stops = travelJournal.entries.filter((entry) => entry.day === day);
                return <section key={day}>
                  <header><span>DAY {day}</span><strong>第 {day} 天</strong><small>{stops.filter(({ checked }) => checked).length}/{stops.length} 完成</small></header>
                  {stops.length ? stops.map((entry) => <label key={entry.id} className={entry.checked ? 'is-checked' : ''}>
                    <input type="checkbox" checked={entry.checked} disabled={busy} onChange={() => toggleJournalEntry(entry.id)} /><span>{entry.kind === 'food' ? '食' : '旅'}</span><p><strong>{entry.name}</strong><small>{entry.location}</small></p><b>{entry.checked ? '完成' : '待訪'}</b>
                  </label>) : <div className="empty-day">和{activePartner.displayName}聊一個想去的地方</div>}
                </section>;
              })}
            </div>
          </>}

          {panel === 'cards' && <>
            <div className="console-heading"><div><span>ABILITY DECK</span><h1>夥伴卡片</h1></div><b>{3 + activeSavedCards.length} / 12</b></div>
            <div className="ability-deck">
              <article className="ability-card featured"><div className="card-art"><PartnerArt partner={activePartner} /></div><span>ACTIVE PARTNER</span><h2>{activePartner.displayName}</h2><p>{activePartner.role}｜{activePartner.quote}</p><b>羈絆 76</b></article>
              {activeSavedCards.map((card) => <article key={card.id} className="ability-card summoned"><span>WEBMCP ABILITY</span><h2>{card.title}</h2><p>{card.ability}｜{card.summary}</p><b>{card.requiredCapabilities.length ? card.requiredCapabilities.join('・') : 'AOZU LOCAL'}</b><button type="button" onClick={() => recallAbilityCard(card)}>召喚能力</button></article>)}
              <article className="ability-card travel"><span>MEMORY CARD</span><h2>台南三日旅行策劃</h2><p>步行友善 ・ 飲食偏好 ・ 旅費規劃</p><b>68% 解鎖中</b></article>
              <article className="ability-card locked"><span>NEXT CARD</span><h2>七日生活節奏</h2><p>連續完成飲食、步行與記帳後取得。</p><b>還差 3 個任務</b></article>
            </div>
          </>}

          {panel === 'memories' && <>
            <div className="console-heading"><div><span>MEMORY CORE</span><h1>共同記憶</h1></div><b>本機保存</b></div>
            <div className="memory-log">
              {activeSavedMemories.map((memory) => <article key={memory.id}><span>{memoryCategoryLabels[memory.category]}</span><div><strong>{memory.title}</strong><p>{memory.summary}</p><small>{new Date(memory.createdAt).toLocaleDateString('zh-TW')} ・ Agent 與使用者確認</small></div></article>)}
              {activeLifeRecords.map((record) => <article key={record.id}><span>{modules.find(({ id }) => id === record.activity)?.category ?? '生'}</span><div><strong>{modules.find(({ id }) => id === record.activity)?.label ?? '生活'}冒險</strong><p>{record.summary}</p><small>{new Date(record.createdAt).toLocaleDateString('zh-TW')} ・ 已完成</small></div></article>)}
              <article><span>旅</span><div><strong>台南旅行書</strong><p>一起決定第二天採步行為主，晚餐預算保留給小吃。</p><small>今天 ・ 旅行</small></div></article><article><span>食</span><div><strong>不追求完美的晚餐</strong><p>記得蔬菜和飽足感，比精算每一口更重要。</p><small>昨天 ・ 飲控</small></div></article><article><span>住</span><div><strong>旅行基金 72%</strong><p>本週咖啡支出已整理，沒有動用旅行基金。</p><small>8 月 29 日 ・ 記帳</small></div></article>
            </div>
            <div className="webmcp-core"><span className="connection-dot" /><div><strong>{runtime?.webmcpAvailable ? 'WebMCP 已連線' : 'WebMCP Core Ready'}</strong><p>Agent 可提案生活紀錄、旅程、穿搭、記憶與能力卡；全部由你確認後才生效。</p></div><b>r{runtime?.stage.revision ?? 0}</b></div>
            <div className="portable-memory"><div><strong>攜帶這位夥伴的記憶</strong><small>ZIP 匯入前會驗證結構、雜湊與資產</small></div><div><button type="button" disabled={!runtime} onClick={exportCompanion}>匯出記憶</button><label>匯入記憶<input className="visually-hidden" type="file" accept=".zip,application/zip" disabled={!runtime} onChange={importCompanion} /></label></div>{dataStatus && <p role="status">{dataStatus}</p>}</div>
          </>}

          {panel === 'adventure' && <>
            <div className="console-heading"><div><span>AOZU ADVENTURE</span><h1>和{activePartner.displayName}出發</h1></div><b>本機計分</b></div>
            <p className="adventure-console-intro">冒險由夥伴或 WebMCP 發起。選一個場景後，會回到以角色為中心的全畫面遊戲。</p>
            <div className="adventure-chooser">
              <button type="button" onClick={() => { setAdventureMode('room'); setMobileConsoleOpen(false); }}><span className="room-preview">●</span><strong>黑炭精靈大作戰</strong><p>房間裡的黑炭精靈會越長越多，點擊牠們讓{activePartner.displayName}發射橡皮筋。</p><b>點擊／觸控射擊</b></button>
              <button type="button" onClick={() => { setAdventureMode('forest'); setMobileConsoleOpen(false); }}><span className="forest-preview" /><strong>風之森林淨路行動</strong><p>跳過風吹來的垃圾，成功避開就能累積分數並保存在這台裝置。</p><b>空白鍵／觸控跳躍</b></button>
            </div>
          </>}

          {runtimeError && <div className="runtime-error" role="alert">{runtimeError}</div>}
        </aside>
      </main>
    </div>
  );
}
