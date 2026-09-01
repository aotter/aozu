# AOZU × OpenAI WebMCP Challenge

## 產品主張

AOZU 是把工具軟體包進冒險養成遊戲的 Companion OS。使用者只要告訴虛擬夥伴「想一起做什麼」，Agent 就能透過 WebMCP 提出一段冒險；使用者確認後，AOZU 才執行任務、保存成果、改變紙娃娃外觀、累積能力，最後把成熟技能封成可再次召喚的 Ability Card。

同一個 ADV 迴圈可以承載旅行、食譜、飲食、健身、運動、記帳、寫作與語言學習，不需要替每種工具重做一套操作模型。

```text
說出目標 → Agent 提出結構化冒險 → 角色在 AOZU 內說明
→ 使用者確認 → Mantle 執行確定性變更 → 成果／點數／外觀／記憶
→ 達成里程碑 → 封成 Ability Card → 下次召喚
```

## 活動對應

OpenAI WebMCP Challenge 以實用性、原創性、執行品質、WebMCP 使用是否深思熟慮，以及人與 Agent 的共同體驗評分。AOZU 的差異不是「Agent 可以按網站按鈕」，而是 Agent、角色與使用者在同一個持續成長的世界中共同完成工作。

官方截止時間是 2026-09-03 13:00 PT，台灣時間為 2026-09-04 04:00。送件需要可使用的公開應用、公開程式碼、專案說明與示範影片。

## P0 — 可錄影的完整成長迴圈

- `inspect_aozu_capabilities`：讓 Agent 先理解角色、活動、紙娃娃物件與確認規則。
- `stage_aozu_life_event`：提案飲食、記帳、步數或健身冒險。
- `stage_aozu_trip_plan`：把多個地點一次整理成旅行手札候選。
- `stage_aozu_outfit`：提案紙娃娃配件，確認後才真正重繪穿搭。
- `stage_aozu_memory`：提出可見的長期記憶摘要，由使用者決定保存。
- `stage_aozu_ability_card`：把角色能力與最小記憶封成可再次召喚的卡片。
- 每個寫入工具只建立 AOZU 內的確認介面；Agent 不可直接發點、換裝、保存記憶或封卡。
- 沒有 WebMCP 時，原本的本機 Companion、手札、衣櫥與遊戲仍可使用。

## P1 — 工具章節

- 食譜／飲食：來源候選、食材整併、採買清單與餐食確認。
- 健身／運動：安全目標、訓練記錄、步數匯入與恢復回顧。
- 記帳：收據與 CSV 候選、整數金額、分類確認與預算摘要。
- 旅行：帶 URL、擷取時間與信心標記的旅行書候選。
- 共筆／語言：提案差異、作者標示、可回復版本與錯題摘要。

## P2 — 送件

- 用 ChatGPT 內建瀏覽器走完所有 P0 工具，建立成功／拒絕／重送的 WebMCP eval。
- 準備三分鐘示範：一句話開始旅行 → Agent 排手札 → 使用者確認 → 完成景點 → 解鎖配件 → 穿上 → 封卡 → 召喚卡片。
- 補專案首頁說明、公開部署、開源授權、Devpost 文字與示範影片。

## Guyspy 架構原則

AOZU 保留 `spike-webmcp-companion` 的 Mantle Fixed Backbone、IndexedDB、本機優先、候選審核、revision 與 idempotency。WebMCP 是可替換的 adapter；紙娃娃、任務、物件與記憶仍由網站既有 use case 驗證和提交，Agent 不直接寫資料庫。
