# AOZU × OpenAI WebMCP Challenge

## 產品主張

**AOZU Companion Forge** 是一個用冒險養成遊戲創造虛擬夥伴的服務。使用者不只是選一隻既有角色，而是透過 AOZU 或 WebMCP 決定夥伴的外型版型、名字、個性、角色定位、誕生配件與第一場任務。完成任務後，夥伴會真正換上獎勵、保存共同記憶，並封成可再次召喚的 Origin Card。

同一個 ADV 迴圈可以承載旅行、食譜、飲食、健身、運動、記帳、寫作與語言學習，不需要替每種工具重做一套操作模型。

```text
描述想創造的夥伴 → Agent 提出 Companion + Origin Quest
→ 使用者在 AOZU 確認 → Mantle 啟用版型與誕生配件
→ 對話完成三步任務 → 累積成長並穿上獎勵
→ 保存第一場共同記憶 → 封成 Origin Card → 下次召喚
```

## 活動對應

OpenAI WebMCP Challenge 以實用性、原創性、執行品質、WebMCP 使用是否深思熟慮，以及人與 Agent 的共同體驗評分。AOZU 的差異不是「Agent 可以按網站按鈕」，而是 Agent、角色與使用者在同一個持續成長的世界中共同完成工作。

官方截止時間是 2026-09-03 13:00 PT，台灣時間為 2026-09-04 04:00。送件需要可使用的公開應用、公開程式碼、專案說明與示範影片。

## P0 — 可錄影的完整成長迴圈

- `inspect_aozu_forge`：讓 Agent 先讀取可用外型版型、能力、配件、三步任務契約與目前創角狀態。
- `stage_aozu_companion`：一次提案夥伴身分與 Origin Quest；只開啟 AOZU 內的可見預覽，不直接創角。
- 使用者確認後才切換角色版型、裝上誕生配件、建立本機角色檔案與第一場任務。
- 旅行、健身、計步、飲控、記帳或共同寫作都使用同一個三步 Origin Quest schema。
- 每次真實操作推進一步；第三步完成時由既有 Mantle action 裝上獎勵，保存共同記憶並自動封存 Origin Card。
- Origin Card 可召回角色的身分、能力與第一場冒險，形成完整服務閉環。
- `inspect_aozu_capabilities`：讓 Agent 理解既有生活活動、紙娃娃物件與確認規則。
- `stage_aozu_life_event`：提案飲食、記帳、步數或健身冒險。
- `stage_aozu_trip_plan`：把多個地點一次整理成旅行手札候選。
- `stage_aozu_checklist_completion`：完成指定手札項目並觸發第三步、任務獎勵與 Origin Card。
- `stage_aozu_outfit`：提案紙娃娃配件，確認後才真正重繪穿搭。
- `stage_aozu_memory`：提出可見的長期記憶摘要，由使用者決定保存。
- `stage_aozu_ability_card`：在 Origin Card 以外，把後續成熟技能封成可再次召喚的 Ability Card。
- `stage_aozu_card_recall`：召回既有卡片與對應能力，完成新任務後留下再次啟用的共同記憶。
- 每個寫入工具只建立 AOZU 內的確認介面；Agent 不可直接發點、換裝、保存記憶或封卡。
- 沒有 WebMCP 時，原本的本機 Companion、手札、衣櫥與遊戲仍可使用。

## P1 — 工具章節

- 食譜／飲食：來源候選、食材整併、採買清單與餐食確認。
- 健身／運動：安全目標、訓練紀錄、步數匯入與恢復回顧。
- 記帳：收據與 CSV 候選、整數金額、分類確認與預算摘要。
- 旅行：帶 URL、擷取時間與信心標記的旅行書候選。
- 共筆／語言：提案差異、作者標示、可回復版本與錯題摘要。

## P2 — 送件

- 用 ChatGPT 內建瀏覽器走完所有 P0 工具，建立成功／拒絕／重送的 WebMCP eval。
- 準備三分鐘示範：一句話描述想要的夥伴 → Agent 提案創角 → 使用者確認 → 完成三步 Origin Quest → 解鎖並穿上配件 → 封卡 → 召喚角色。
- 補專案首頁說明、公開部署、開源授權、Devpost 文字與示範影片。

## Guyspy 架構原則

AOZU 保留 `spike-webmcp-companion` 的 Mantle Fixed Backbone、IndexedDB、本機優先、候選審核、revision 與 idempotency。WebMCP 是可替換的 adapter；紙娃娃、任務、物件與記憶仍由網站既有 use case 驗證和提交，Agent 不直接寫資料庫。
