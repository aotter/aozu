# Architecture

```text
UI / WebMCP -> Application -> Domain
                         <- ports <- IndexedDB / ZIP
```

- `core` 不依賴 React、WebMCP、IndexedDB 或 ZIP。
- `adapters` 負責邊界整合與資料翻譯。
- `bootstrap.ts` 是唯一的組裝點。
- 啟動順序固定為 WebMCP capability → application orchestration → IndexedDB hydrate。
- shadcn primitives 只放在 `src/ui/components/ui`。
