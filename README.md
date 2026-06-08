# Pixly

An extensible Chrome (Manifest V3) toolset for visual web development. v1 ships two tools:

- **Fix Broken Images** — replaces broken `<img>` elements in place with same-size, same-shape SVG
  placeholders so the layout stays intact. Fully reversible.
- **Image Overlay** — overlays a design export (e.g. a Figma PNG) on the real page with opacity,
  blend mode (including `difference`), position, scale, lock, and show/hide, to compare the design
  against the implementation pixel by pixel.

Both tools persist per site and survive full reloads, and only activate where you turn them on. All
of Pixly's own UI lives inside an isolated Shadow DOM, so it never pollutes the page.

## Tech stack

- **Vite** + **@crxjs/vite-plugin** (MV3 bundling with HMR)
- **TypeScript** (strict mode)
- **Preact** for Pixly's own reactive UI only (popup + in-page toolbar), always inside the Shadow DOM
- **Vitest** + **happy-dom** for unit tests of the pure logic

The page-affecting effects (the mutated `<img>`, the overlay node and its drag) use direct DOM and
Pointer Events APIs — never Preact — so interactions like the overlay drag stay precise.

## Develop

```bash
npm install
npm run dev        # Vite dev server with HMR for the extension
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint, 0 warnings allowed
npm run test       # vitest (unit tests)
npm run build      # typecheck + production build into dist/
```

## Load the unpacked extension in Chrome

1. Run `npm run build` (or `npm run dev` for a live-reloading build).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin Pixly from the extensions menu, open any page, and click the Pixly icon to toggle tools.

> During `npm run dev`, `@crxjs/vite-plugin` writes a live `dist/` that hot-reloads on save; reload
> the extension from `chrome://extensions` if you change the manifest or service worker.

## Permissions

Pixly follows least privilege (no permanent `<all_urls>` grant):

- `activeTab` + `scripting` — act on the tab you are using.
- `storage` — persist light per-site config in `chrome.storage.local`.
- Overlay image binaries are stored in **IndexedDB** to avoid storage-quota limits.

## Architecture

- `src/content/core/` — the `Tool` contract and `ToolRegistry`. The popup and in-page toolbar are
  built dynamically from the registry, so adding a tool is a single registration (RF-CORE-1).
- `src/content/tools/` — each tool is self-contained. Pure logic (detection, geometry, persistence)
  is separated from DOM glue so it is unit-testable.
- `src/content/ui/` — the Shadow DOM host and the Preact toolbar.
- `src/shared/` — types, design tokens, scope derivation, and the persistence layer
  (`chrome.storage.local` config document + IndexedDB image store).

### Adding a new tool

1. Implement the `Tool` interface in `src/content/tools/<your-tool>/`.
2. Register it in `src/content/core/create-registry.ts`.
3. Add a catalog entry in `src/shared/constants/tool-catalog.ts` so the popup lists it.

No changes to the core, the persistence layer, or other tools are required.
