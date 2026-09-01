# AOZU

**AOZU — Aotter Omnilife Zone Universe**  
中文正式名稱：**電獺全生活伴生宇宙**  
產品標語：**每一次上網，都和一個角色共同完成、共同成長。**

AOZU 是 AotterPassport 的獨立 Web 概念計劃。它把虛擬角色從「被收藏的卡片」變成能和使用者一起完成真實任務的網路替身／伴侶：陪計步、健身、飲控與記帳，也能發展關係、規劃旅行、共寫筆記或小說及一起學語言。完成任務會累積成長值，解鎖服裝、配件、外貌、能力與可再次召喚的記憶卡。

名稱中的四個字：

- **Aotter**：承接電獺品牌、角色與 AotterPassport 生態。
- **Omnilife**：涵蓋健康、旅行、關係、創作與學習等生活面向。
- **Zone**：使用者與角色共同生活、工作及冒險的空間。
- **Universe**：讓角色、記憶、能力卡與任務跨情境延續的世界。

`OZ` 與 `U` 也保留了兩個動畫虛擬世界的命名致意，但 AOZU 的正式定義以電獺自己的產品語言為準。

## 與原 App 的關係

本資料夾是隔離的 Web 專案，不修改、不依賴原 App 的啟動、建置、資料庫或 iOS 專案。AOZU 固定使用本機 `3100` 埠，避免占用原 App 常用的 `3000` 埠。

| 系統 | 初期責任 |
| --- | --- |
| AotterPassport | 會員、合作夥伴事件、八大維度、官方卡片／權益的既有事實來源 |
| AOZU | 角色任務、對話、私密記憶、共同作品、衣櫥、能力卡與 WebMCP 互動 |
| 未來 Bridge | 經使用者授權後，交換必要的成長摘要與官方權益；不直接共用資料庫 |

AOZU 初版只使用本資料夾內的素材副本與示範資料。未來即使接上 AotterPassport，也要透過有版本、可撤銷授權的 API，而不是從原 App 的內部檔案或資料表直接讀取。

## 參考基礎

技術計劃以 [`aotter/spike-webmcp-companion`](https://github.com/aotter/spike-webmcp-companion) 的 React SPA 為基礎，盤點版本為 commit `373cbcc856642364033ef0c564189b45788ea8e1`（2026-08-31）。它已具備 WebMCP、Mantle、IndexedDB、角色／場景圖層、候選內容審核與 ZIP 可攜匯出等適合 AOZU 的能力。

目前已把該 commit 的 Companion 核心與 adapters 放入 [`site/companion/`](site/companion/)，並接上 AOZU 介面。採用的框架包含 Mantle Fixed Backbone、IndexedDB 原子交易、WebMCP tools、角色／場景資產驗證、候選審核，以及可攜式 ZIP 的完整性驗證。AOZU 自己的 companion 定義放在 [`site/companion/aozu.ts`](site/companion/aozu.ts)，上游核心集中於獨立子資料夾，方便後續比較與更新。

## 文件

- [產品計劃](docs/PRODUCT_PLAN.md)：服務定位、使用情境、成長與能力卡規則。
- [技術設計](docs/TECHNICAL_PLAN.md)：WebMCP 邊界、資料所有權、素材匯入與安全設計。
- [交付計劃](docs/DELIVERY_PLAN.md)：由旅行情境開始的分階段實作與驗收條件。
- [素材參考包](assets/README.md)：由原 App 複製且不反向影響原檔的首批視覺素材。

## 本機視覺原型

互動式 RWD Web 位於 [`site/`](site/)，主畫面是夥伴房間與遊戲 HUD，不採一般網站式 Dashboard。使用者可在布丁獺、泡泡海豹、夜航鯨、琥珀鼬，以及電獺少女蜜柑、Space、嘻嘻七張夥伴卡之間切換；每次進場都會說明角色定位與能一起完成的事情。布丁獺衣櫥已有五套透明紙娃娃圖層，可直接拖曳、縮放、重設並固定在角色身上，位置與裝備都會寫入 Companion item state／loadout。旅遊任務提供兩階段夥伴對話，先輸入店家或景點、再補位置，內容會寫入三日旅行手札與 checklist；規劃及完成行程會累積探索、品味、規劃、羈絆，並替每位角色逐步解鎖三件專屬旅行配件。生活地圖以食、衣、住、行、育、樂組織，現階段接入飲控、記帳、計步、旅遊與健身五項可持久化任務。

```bash
cd aozu-web/site
pnpm install
pnpm dev
```

開啟 `http://127.0.0.1:3100/`。WebMCP 會在支援 `document.modelContext` 的瀏覽器自動註冊；其他瀏覽器仍可完整使用本機 Companion。這一版只在 Local 端運作，尚未接 AotterPassport Bridge，也沒有部署設定中的 `project_id`。

驗證 Companion 框架與正式建置：

```bash
pnpm test:companion
pnpm build
```

## 首發決策

- 首發生活版同時包含計步、健身、飲控、記帳與旅行；以共用的 Today、Quest、Points 與 Ability Card 串接。
- 第一條跨模組展示故事是「和角色一起完成一趟旅行」，途中自然使用步數、體力、飲食與旅費紀錄。
- 卡片是完成任務後取得的「能力＋經過篩選的記憶快照」，不是只有收藏圖。
- 點數與獎勵只能由可驗證規則產生；AI 可以提案，不能自行發點或發道具。
- AOZU local-first；沒有 WebMCP 時仍能查看角色、任務、作品與本機進度。
- 健康與帳務資料分開授權及保存；Points 鼓勵規律紀錄與完成目標，不獎勵少吃、過度運動或增加消費。
- 初版不做隨機抽卡、公開角色市集、戀愛配對或健康診斷。
