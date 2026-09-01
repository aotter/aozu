# AOZU 交付計劃

## 建置方式

每一階段只交付一條可完整走完的使用者路徑；結束時通過 focused check、全專案 test／lint／build、涉及 UI 時的瀏覽器 smoke test，以及匯出／清除／匯入回復驗證。

AOZU 應建立在獨立 `aozu-web/` Web 專案內，不加入原 App 的 package scripts、database migrations、server imports 或 iOS target。若未來要在同一 repository 共存，AOZU 自有 `package.json`、lockfile、環境設定、建置輸出與部署設定。

## Phase 0：產品與素材邊界（本次完成）

- 正式命名、產品原則、核心資料物件，以及計步、健身、飲控、記帳與旅行的首發故事。
- AotterPassport／AOZU／Bridge 的責任切割。
- WebMCP 候選審核、任務完成、獎勵與 Ability Card 安全邊界。
- 首批原 App 素材的不可變參考副本與來源清單。
- 參考 Companion commit 固定為 `373cbcc856642364033ef0c564189b45788ea8e1`。

## Phase 1：AOZU Life（MVP）

計步、健身、飲控、記帳與旅行都在同一個首發里程碑內完成。為了讓每次交付可驗證，仍依序做成小切片；後面的切片共用前面已通過的 Life Record、Quest、Points 與權限邊界。

### Slice 1 — AOZU 基線

- 從指定 Companion commit 建立獨立 React SPA，保留 Mantle、IndexedDB、ZIP 與 WebMCP adapter。
- 改為 AOZU 品牌與繁體中文介面，建立布丁獺示範 pack。
- 首頁呈現角色、Today 短摘要、當前 Quest、主要互動與衣櫥入口。

驗收：沒有 WebMCP 時仍能啟動、查看角色、建立本機角色資料並匯出／匯入。

### Slice 2 — Life Record 與分艙授權

- 建立 StepSummary、WorkoutSession、MealEntry、LedgerEntry 的版本化儲存與候選審核。
- 健康／飲食和帳務使用不同 object stores、scope、匯出選項與刪除流程。
- 註冊 `inspect_life_module_contract`、`stage_life_record_candidate`、`review_life_record_candidate`。

驗收：未授權的模組不能被角色或其他 Quest 讀取；OCR、CSV 與 Agent 候選在使用者確認前不進 canonical store。

### Slice 3 — 計步

- 支援手動每日步數與 CSV 匯入，顯示日／週摘要、目標、連續紀錄和散步 Quest。
- 依日期、來源及外部 ID 去重；更正建立新 revision。
- 完成安全的步行目標後發放固定 Points、活力經驗與第一個散步配件。

驗收：重複匯入不重複計步或發獎；調低／跳過目標不扣 Bond，手動資料清楚標示來源但仍可正常使用。

### Slice 4 — 健身

- 支援訓練計劃、運動種類、時間、組次／重量、自覺強度與完成回顧。
- 角色可調整一般訓練 Quest、安排休息並提供動作教材；健康警示轉介專業協助。
- 里程碑解鎖訓練服與健身能力卡候選。

驗收：Points 依安全完成與紀錄發放，不因超量運動增加；能力卡不包含完整健康紀錄或醫療推論。

### Slice 5 — 飲食管理（飲控）

- 支援文字、常用餐、照片辨識候選、補水、備餐與採買清單。
- 熱量／體重功能預設關閉；過敏、文化／宗教、預算與個人偏好分欄保存。
- 角色建立使用者自訂的飲食 Quest 與回顧，不做診斷或治療性處方。

驗收：照片辨識不直接寫入；原始照片可獨立刪除；Points 不依低攝取、體重下降或連續節食加成。

### Slice 6 — 個人記帳

- 支援帳戶、手動收支、常用項目、收據／CSV 候選、分類、預算與月度現金流。
- 金額使用幣別最小單位整數；轉帳配對且不重複計入收支；更正保留稽核歷史。
- 角色協助分類候選、每日記帳 Quest 與預算回顧，建立記帳能力卡候選。

驗收：OCR／Agent 不能直接入帳；相同匯入不重複；Points 獎勵記錄與對帳，不按消費金額發放；能力卡沒有卡號、銀行憑證或完整逐筆帳。

### Slice 7 — 旅行需求、旅行書與行程

- 建立目的地、日期、預算、同行者、步行能力與偏好表單。
- 註冊 `inspect_aozu_quest`、`stage_aozu_artifact`、`review_aozu_artifact`。
- 驗證來源 URL、擷取時間、事實、信心與易變資訊；顯示缺漏和衝突。
- 顯示有來源的旅行書、地點卡、每日路線與未確認事項。
- 使用者可修改、拒絕、重新產生及核准一個版本。
- 逐項選擇是否帶入步行能力、飲食偏好與旅行預算摘要；核准後才產生可執行 Quest stages。

驗收：Agent 可交付多來源候選但不能改 active Artifact；所有採用的易變事實可回到來源；未授權的生活模組仍不可見。

### Slice 8 — 統一獎勵、衣櫥與 Ability Cards

- 五個模組都使用冪等 completion transaction、同一 Points ledger 與八大維度投影。
- 依里程碑預覽卡名、能力、記憶摘要、來源、裝備與所需權限。
- 使用者可排除敏感資料後封卡、撤銷卡片，再次召喚時逐項授權。
- 完成 export → clear → import，驗證勾選匯出的模組、Quest、Artifact、Points、衣櫥與卡片一致。

驗收：相同事件重送不重複發獎；Agent 無法直接完成任務或發點；任何卡片都不包含 raw 健康／飲食／帳務／瀏覽資料或憑證。

## Phase 2：裝置與資料來源整合

- 以獨立 adapter 接使用者選定的健康資料來源，只要求每日步數或指定訓練摘要。
- 加入收據批次掃描與銀行匯出格式 adapter；直接銀行連線需另做供應商、法遵與 token 隔離評估。
- 加入跨模組本機摘要，例如旅行步行負荷、餐食偏好與旅費預算；每次分享仍須預覽授權。
- 語言學習加入短練習、複習結果與確認過的錯題記憶，共用 rhythm／mastery。

進入條件：Phase 1 的事件冪等、記憶撤銷、匯出／匯入與 Points 對帳已穩定。

## Phase 3：共筆與共同創作

- 版本化 Artifact editor、來源／作者標示、提案差異與回復。
- 筆記、人物設定、章節與共同世界觀。
- Ability Card 可帶入風格與世界觀摘要，但不自動取得整份作品。

進入條件：使用者可明確區分自己的文字、Agent 提案與已接受版本。

## Phase 4：AotterPassport Bridge

- 帳號連結、官方八大維度摘要與素材 entitlement 的 read-only 同步。
- 完整同意／撤銷、token scope、資料最小化與 reconciliation。
- 經反濫用與帳務稽核後，才評估 AOZU completion events 回寫與跨服務 Points。

進入條件：Bridge API 合約獨立評審完成；AOZU 仍可在 Bridge 離線時使用本機資料。

## Phase 5：關係與社群

- 深度虛擬關係、共同回憶與安全的親密互動。
- 公開分享、角色／能力卡交換或真人交友僅在身分、年齡、內容治理、檢舉、封鎖與反操弄機制齊全後評估。

## MVP 不做

- 隨機抽卡與付費卡池。
- 真人配對、公開角色市集或使用者間金錢交易。
- 自動購買／訂位、背景定位、未確認的行程發布。
- 醫療診斷、飲食治療、復健處方、投資／借貸／稅務決策。
- 未經確認的餐食辨識、收據 OCR、自動分類或銀行交易寫入。
- 將全部聊天或瀏覽歷史默認成長期記憶。
- 即時跨裝置同步、多人即時共編與第三方插件市集。

這些功能要在首發生活版證明「共同完成 → 可驗證成長 → 可攜能力」有價值後，再各自建立需求與安全門檻。
