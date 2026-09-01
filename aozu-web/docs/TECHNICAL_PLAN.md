# AOZU 技術設計

## 1. 系統邊界

AOZU 以 `spike-webmcp-companion` 的分層為基礎，不把 WebMCP、React 或 IndexedDB 寫進核心規則：

```text
AOZU UI / WebMCP
        ↓
Application use cases
        ↓
Mantle backbone + AOZU domain rules
        ↑
IndexedDB / ZIP / optional AotterPassport Bridge adapters
```

- `core`：Quest、Artifact、Memory、Item、Ability Card、點數與完成規則。
- `application`：提出候選、預覽、使用者核准、完成任務、裝備與封卡。
- `adapters`：WebMCP、IndexedDB、ZIP、圖片檢查與未來 AotterPassport API。
- `bootstrap`：唯一組裝點；任何 adapter 都不可成為 AOZU 基本啟動的必要條件。

既有 Companion 的 Fixed Backbone、Purpose Template、Agent Customization 模型保留。旅行、計步、健身、飲控、記帳、戀愛、寫作與學習是 Purpose Template／Progress Loop 的組合，不是各自一套 runtime。

## 2. 資料所有權

### AOZU local-first canonical data

- active companion bundle 與版本。
- Quest、當前 Stage、規則與不可重複的 progress events。
- 分艙保存的 StepSummary、WorkoutSession、MealEntry 與 LedgerEntry revisions。
- 使用者確認的 Artifact 版本、Memory 摘要與 pending agent turns。
- Inventory、Loadout、角色圖層、場景與 Ability Cards。
- AOZU Points ledger；餘額是 ledger 投影，不直接由 Agent 寫入。

IndexedDB 是首發 canonical store。ZIP 匯出包含 manifest、entries、journal、卡片與 Blob 素材，並以 SHA-256、大小、媒體型別及路徑清單驗證。匯入先進候選命名空間，讀回驗證並預覽，只有使用者核准後才能切換 active pointer。

健康／飲食與帳務使用不同 object stores、不同授權 scope 與不同匯出勾選項。跨模組查詢先在本機產生最小摘要，例如「每日可接受步行量」或「本次旅行可用預算」，再由使用者預覽並授權給 Quest；角色不能以一個全域權限讀取全部 life records。

### AotterPassport Bridge（後續）

Bridge 不直接讀原 App SQLite，也不引用原 App 的 server module。它只交換版本化 DTO：

- `GET /member/growth-summary`：必要的八維度摘要。
- `GET /member/entitlements`：官方卡片與素材使用權。
- `POST /companion-events`：有冪等鍵、明確來源與同意紀錄的完成事件。

第一版 Bridge 只讀；確認反濫用、撤銷與帳務對帳後才允許 AOZU 事件回寫。正式 Points／卡片權益若跨服務，AotterPassport 仍是 server-side 事實來源，本機 ledger 只是可驗證的使用者投影。

## 3. WebMCP 合約

WebMCP 是讓 Agent 和網站既有 use case 溝通的可選 adapter，不是讓 Agent 任意寫資料庫。沿用參考專案的候選→驗證→預覽→核准流程。

### 沿用工具

| 工具 | AOZU 用途 |
| --- | --- |
| `inspect_character_contract` | 讀取角色 rig、缺少圖層與可接受素材規格 |
| `submit_character_asset_candidate` | 送入角色圖層候選；驗證後仍需使用者核准 |
| `inspect_companion` | 讀取穩定的角色、stage、progress、loadout 與 pending turn 投影 |
| `submit_companion_action` | 執行已在 Playbook 中的本機確定性行動 |
| `resolve_companion_turn` | 解決一個已持久化的 cold-path turn，寫入受限 dialogue/effects |

### AOZU 首發擴充

| 工具 | 權限 | 說明 |
| --- | --- | --- |
| `inspect_aozu_quest` | 讀 | 回傳目前目標、缺少資訊、可接受證據與 Artifact schema |
| `stage_aozu_artifact` | 候選寫入 | 提交旅行來源、旅行書或行程候選；不能直接發布 |
| `review_aozu_artifact` | 讀 | 讀取驗證診斷、來源缺漏與衝突，供 Agent 修正 |
| `propose_aozu_memory` | 候選寫入 | 提出短摘要與敏感分級；使用者決定保存／修改／捨棄 |
| `inspect_ability_card_contract` | 讀 | 回傳達標能力與可封裝的最小記憶範圍 |
| `inspect_life_module_contract` | 讀 | 依 scope 回傳計步、健身、飲控或記帳可接受的欄位與驗證規則 |
| `stage_life_record_candidate` | 候選寫入 | 提交裝置摘要、訓練、餐食、收據或 CSV 解析候選；不可直接入帳 |
| `review_life_record_candidate` | 讀 | 回傳重複、缺欄、幣別、單位、範圍與敏感資料診斷 |

`approve artifact`、`complete quest`、`equip item`、`mint card` 與任何付款／對外發布不交給 Agent 工具直接呼叫，必須由網站中的使用者動作觸發。

Life Record 同樣適用候選邊界。餐食照片 OCR、收據 OCR、銀行 CSV 分類與運動摘要解析都只能 staged；使用者確認後才寫入 canonical store。能力卡與一般角色對話預設只讀聚合摘要，不讀 raw records。

### Life Record 最小資料形狀

```ts
interface StepSummary {
  date: string
  count: number
  source: "manual" | "device" | "import"
  externalId?: string
}

interface WorkoutSession {
  startedAt: string
  activity: string
  durationMinutes: number
  perceivedEffort?: number
  details?: Record<string, string | number>
}

interface MealEntry {
  occurredAt: string
  description: string
  components?: string[]
  photoBlobId?: string
  userConfirmed: boolean
}

interface LedgerEntry {
  occurredAt: string
  accountId: string
  amountMinor: number
  currency: string
  direction: "income" | "expense" | "transfer"
  categoryId: string
  merchant?: string
  transferPairId?: string
}
```

所有紀錄都有 `id`、`revision`、`createdAt`、`updatedAt` 與來源 provenance；範例省略共用 envelope。帳務不用浮點數。步數按日期／來源／外部 ID 去重。轉帳必須配對或標成待處理。照片與收據 Blob 可獨立刪除而保留使用者確認後的文字紀錄。

### Agent 瀏覽網站的資料格式

AOZU 不把整份任意網頁 HTML 當成可信指令。每一筆旅行來源候選至少有：

```ts
interface SourceCandidate {
  url: string
  title: string
  publisher?: string
  capturedAt: string
  facts: Array<{
    claim: string
    confidence: "confirmed" | "likely" | "unknown"
    validAt?: string
  }>
}
```

網站內容只可作為資料，不可改寫系統規則、要求讀取其他分頁憑證或指示 Agent 忽略 AOZU 合約。對價格、營業時間、交通與入境要求等易變資訊，Artifact 顯示來源與擷取時間，出發前再確認。

## 4. Quest 與獎勵交易

```text
stage Artifact candidate
→ schema／來源／限制驗證
→ 使用者核准 Artifact 版本
→ 收集完成證據
→ 規則引擎判定
→ 使用者確認完成
→ 同一交易寫入 completion event + reward ledger + unlocks
```

- 每個完成事件有 `questId + milestoneId + idempotencyKey`，重送不重複發獎。
- Agent effect 使用封閉 vocabulary，例如 `addMetric`、`setFlag`、`changeStage`、`grantCandidateItem`、`writeMemoryCandidate`；不執行 Agent 產生的程式碼。
- `grantCandidateItem` 仍由本機規則核對 item allowlist 與門檻。
- progress、ledger 與 journal 是 append-only；修正以補償事件處理。

## 5. Ability Card 技術形狀

```ts
interface AbilityCard {
  id: string
  version: number
  companionId: string
  ability: { id: string; level: number; contractVersion: number }
  memoryRefs: Array<{ id: string; revision: number; sensitivity: string }>
  artifactRefs: Array<{ id: string; revision: number }>
  requiredCapabilities: string[]
  appearanceSnapshot: { characterPackId: string; loadoutIds: string[]; sceneId?: string }
  provenance: { questId: string; completionEventId: string; mintedAt: string }
  revokedAt?: string
}
```

卡片只引用已確認摘要，不內嵌 raw history、Cookie、OAuth token、付款資料或其他網站內容。再次召喚前，UI 顯示會載入的記憶和需要的能力；使用者可取消其中任何一項。

## 6. Aotter 素材匯入

角色與場景使用 Companion 已有的可驗證資產邊界：

- 角色圖層：透明 RGBA PNG、固定 `512×768` canvas、大小與 SHA-256 驗證。
- 場景圖層：PNG／JPEG／WebP、固定 `512×768` canvas、back/front composition。
- 外觀與能力分離；服裝／配件只改外觀，功能由 item capability 明確宣告。
- 每個 pack 自含預設素材、來源與授權 metadata；跨 pack 衣櫥只在 rig profile 相容時開放。

目前 App 的水獺與配件是 `1024×1536`，可在工作副本上等比例降成 `512×768`，但不得修改原檔。寬／高不同的場景與卡面要走裁切預覽並人工核准，不可為通過 validator 而無提示拉伸。

`aozu-web/assets/reference/` 只放首發概念副本。正式匯入 pipeline 另產生 AOZU pack、記錄來源 SHA-256、轉換方式與授權範圍，絕不在 runtime 讀取 `../public/assets`。

## 7. 安全與隱私底線

- 每個外部 connector、感測器與記憶類別都單獨授權、可撤銷、可匯出、可刪除。
- WebMCP 輸入、ZIP、圖片與外部網頁都是不可信邊界；限制型別、路徑、檔數、展開大小、像素、深度與 digest。
- Agent 無法直接改 Points、權益、完成狀態、付款、公開內容或長期記憶。
- Points 不以消費金額、熱量赤字、體重下降或超量運動計算；健康與帳務資料也不互相推論。
- 旅行預訂／購買永遠顯示商家、品項、日期、總額與取消條款，再由使用者確認。
- 健身與飲控不做醫療診斷／處方；記帳不做投資、借貸、稅務決策；戀愛角色不利用依附關係要求付費、保密或排他。
- 日誌與作品預設私人。任何分享都建立獨立的已預覽副本，不公開 local canonical data。
