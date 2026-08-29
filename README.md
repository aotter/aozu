# Companion Vault browser capability spike

Requires Node.js 22 or newer.

Minimal React SPA testing:

- WebMCP tool registration with `document.modelContext`
- `showDirectoryPicker()` read/write
- `FileSystemDirectoryHandle` persistence in IndexedDB
- small UI metadata in localStorage
- Cloudflare Workers Static Assets

```sh
pnpm dev
pnpm cf:preview
pnpm deploy
```

The file-system test creates `.companion-vault-spike.json` in the directory selected by the user.
