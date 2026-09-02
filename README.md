# Companion

正式版 React SPA 骨架，部署目標為 Cloudflare Workers Static Assets。

```bash
pnpm install
pnpm dev
pnpm build
pnpm deploy
```

本專案源自 WebMCP POC；WebMCP、IndexedDB／ZIP、Markdown journal 與角色資產流程均已整合至主程式，架構決策記錄於 [`docs/adr/`](./docs/adr/)。

## AOZU branch

`codex/aozu` 以 Companion 原生流程為唯一主線，並加入「AOZU 起源任務」Starter：

```text
創角 → 角色候選稿審核 → 建立 Companion → 完成旅行任務
    → 取得並穿上完整遠航造型 → 封存 Origin Card → 從首頁再次召喚
```

開發時可用 `pnpm dev --host 127.0.0.1 --port 3100` 在本機檢視；不需要部署。
