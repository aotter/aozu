# AOZU — Devpost submission kit

Submission deadline: September 3, 2026 at 1:00 PM PDT (September 4 at 4:00 AM in Taiwan).

## Project details

- Project name: **AOZU**
- Tagline: **An agent-native forge for reliable layered character packs**
- Live app: https://companion.aozu.workers.dev
- Public repository: https://github.com/aotter/aozu
- License: Apache-2.0

## Short description

AOZU is an agent-native character workshop where a person directs the creative intent, an AI agent creates or repairs the artwork, and the website turns the result into a validated, editable, portable character pack. WebMCP gives the agent structured access to the same workspace the person sees, replacing fragile screen automation with explicit contracts, revisions, safe mutations, and immediate visual review.

## Full description

### Inspiration

Generating one beautiful character image is easy; producing a coherent set of expressions, outfits, and props is not. Separate generations drift in pose, scale, alignment, transparency, and identity. We wanted a workflow where a person can simply describe a companion while an agent handles the mechanical work without taking control away from the creator.

### What it does

AOZU turns the browser into a shared character forge for a human and an AI agent. A creator starts or imports a character, asks the agent to inspect the current workspace, and works through body, expression, outfit, and prop layers. AOZU validates every submitted asset, protects pixels that must not change, checks revisions and source hashes, normalizes supported inputs, stitches layers deterministically, and renders the result for human review. The creator can adjust alignment, undo or redo changes, duplicate a character, and export a portable character pack containing editable sources and a lossless WebP texture atlas.

### Why WebMCP is essential

Without WebMCP, an agent must infer application state from screenshots, guess which controls to click, and hope that generated assets satisfy invisible technical constraints. AOZU exposes the exact state and contract instead. The agent can discover what is missing, read the correct reference image and editable-region mask, submit a candidate against a specific revision and SHA-256 source hash, apply a measured transform, and navigate the creator directly to the result. The website remains the source of truth while the human remains the final reviewer.

This makes the experience faster and more reliable, but also enables something that was previously difficult: probabilistic image generation inside a deterministic, reversible production pipeline shared by a person and an agent.

### How we implemented WebMCP

AOZU registers nine public tools through `document.modelContext.registerTool`:

1. `inspect_workspace`
2. `navigate_character`
3. `inspect_character_contract`
4. `update_character_profile`
5. `replace_character_asset`
6. `repair_character_asset`
7. `set_character_variant_transform`
8. `undo_character_change`
9. `redo_character_change`

The public tools are projected from the same Mantle application contracts used by the React UI. IndexedDB stores browser-local character workspaces and image blobs. Candidate submission checks dimensions, RGBA transparency, visible bounds, canvas overflow, revision freshness, and source hashes. PixiJS renders the same compiled atlas that is included in the exported character ZIP.

### What people and agents can do together

- A person describes a coherent character instead of manually preparing every production asset.
- The agent reads machine-readable visual constraints instead of guessing from the UI.
- AOZU rejects unsafe or stale changes and preserves protected pixels.
- The person reviews each result in context and can adjust, undo, redo, duplicate, or export it.
- The finished pack can leave AOZU and be imported again without an account or server-side state.

### Challenges

The hardest problem was defining a safe boundary between creative generation and deterministic editing. AOZU deliberately does not hide uncertainty: the agent creates the pixels, while the application owns validation, normalization, protected regions, revision control, stitching, persistence, and export. Building one contract that could serve both the human UI and WebMCP tools prevented the two workflows from drifting apart.

### Accomplishments

- A non-trivial nine-tool WebMCP workflow rather than button automation
- Revision- and SHA-256-bound asset mutations
- Protected-region character editing and deterministic layer stitching
- Local-first persistence, undo/redo, duplication, import, and export
- A lossless WebP texture atlas shared by preview and exported packs
- Responsive AOZU parchment UI with nine languages

### What is next

The competition build intentionally closes one loop: create, repair, review, and export a companion. The same portable character contract can later power AOZU adventures, memories, skills, rewards, and task-specific companion cards without weakening the character pipeline demonstrated here.

### New work during the challenge

Development began on August 29, 2026, within the submission period. The public Git history contains 128 commits from the initial WebMCP/IndexedDB spike (`8fde417`) through the current AOZU character harness. The repository history documents the WebMCP extensions and can be used as dated evidence under the existing-project rule.

## Demo video script (2:40 target)

### 0:00–0:20 — The problem

Show a finished AOZU character and its expression/outfit slots.

Narration: “Image models can make a beautiful character, but separate generations rarely become a reliable asset pack. Expressions drift, outfits replace the pose, and fake transparency breaks compositing.”

### 0:20–0:45 — The shared workspace

Open the character library, create a character, and show the editor.

Narration: “AOZU is a local-first character forge shared by a person and an AI agent. The person sets the intent and reviews every change. The site owns the state and production constraints.”

### 0:45–1:15 — Inspect with WebMCP

Ask the agent to call `inspect_workspace`, navigate to an incomplete expression, and call `inspect_character_contract`.

Narration: “WebMCP means the agent does not guess from a screenshot. It discovers missing work and receives the exact reference, editable mask, dimensions, layer order, revision, and source hash.”

### 1:15–1:55 — Submit and validate

Have the agent submit or repair one expression or outfit. Show a rejected invalid candidate if it can be demonstrated quickly, then submit the valid asset.

Narration: “Creative generation stays flexible, but acceptance is deterministic. AOZU validates transparency and bounds, rejects stale changes, preserves protected pixels, stitches the layer, saves it locally, and opens the result for review.”

### 1:55–2:20 — Human control

Select the result, adjust its transform, then demonstrate undo and redo.

Narration: “The human remains in control. Every accepted change is visible, adjustable, and reversible, and both the UI and the agent use the same application contract.”

### 2:20–2:40 — Portable result

Export the character ZIP and briefly show the source assets, manifest, and WebP atlas.

Narration: “The result is not trapped in a demo. AOZU exports editable sources, metadata, and a lossless texture atlas as a portable character pack. This is the foundation for companions that can grow into many experiences.”

## Final submission checklist

- [ ] Join the hackathon with the authorized individual or organization representative.
- [ ] Confirm the live URL loads without authentication in ChatGPT's in-app browser.
- [ ] Test all nine WebMCP tools against the deployed build.
- [ ] Confirm the deployment matches the demo video.
- [ ] Make the repository public and use https://github.com/aotter/aozu as the code URL.
- [ ] Confirm `LICENSE` is visible as Apache-2.0 on GitHub.
- [ ] Record a public YouTube video under three minutes with English narration or English captions.
- [ ] Avoid unlicensed music, trademarks, and third-party copyrighted material in the video.
- [ ] Paste the English description above into the Devpost submission.
- [ ] If the app needs credentials, add them to the private testing instructions.
- [ ] Submit before September 3, 2026 at 1:00 PM PDT.
