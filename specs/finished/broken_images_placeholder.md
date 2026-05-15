# Fix Broken Images

## Overview

Pixly users frequently inspect layouts on staging environments, design previews, and pages with unreliable image hosts. When images fail to load, the resulting empty spaces (or browser's default broken-image icon) make it difficult to assess the intended layout, spacing, and visual hierarchy of the page.

The **Fix broken images** tool detects `<img>` elements that failed to load on the current page and overlays them with neutral, dimensioned placeholders. The placeholders respect the original element's CSS properties (size, border-radius, object-fit, margins, etc.) so the layout looks as it would with valid images in place. Each placeholder displays the rendered dimensions and a truncated version of the original URL to aid debugging.

This is a non-destructive visual-only tool: the underlying `<img>` elements are not removed or replaced in the DOM, the original `src` attribute is preserved, and turning the tool off restores the page to its natural (still broken) state.

The tool integrates with Pixly's existing tool framework: it is toggled from the popup, persists its enabled/disabled state in extension storage, and supports an optional keyboard shortcut consistent with other tools.

## User Stories

- As a **frontend developer** reviewing a staging environment, I want broken images replaced with sized placeholders so I can evaluate the page layout even when image hosts are misconfigured.
- As a **designer** auditing a production page with intermittent CDN issues, I want to see the dimensions and source of each broken image so I can report which assets are failing.
- As a **QA engineer** testing a SPA with lazy-loaded images, I want newly-rendered broken images to be replaced automatically without having to re-toggle the tool.

## Acceptance Criteria

1. Activating the tool from the popup scans the current page and applies a visual placeholder to every broken `<img>` element.
2. Deactivating the tool removes all placeholders and leaves the page indistinguishable from a session where the tool was never enabled.
3. Placeholders preserve the original element's outer dimensions, position, margins, border-radius, and any other CSS that affects layout or shape.
4. Each placeholder displays the rendered width and height (e.g. `320×180`) and a truncated original URL.
5. Images added to the DOM after the tool is active (SPA navigation, lazy loading, infinite scroll) are evaluated and, if broken, receive a placeholder automatically.
6. Valid (successfully loaded) images are never modified.
7. The tool's enabled state is persisted across page reloads and survives full-page navigations within the same tab.
8. The tool degrades gracefully on pages with strict Content Security Policies: if placeholders cannot be applied, the page remains unmodified and no JavaScript errors leak into the page console.
9. The tool can be activated and deactivated via a keyboard shortcut, consistent with other Pixly tools.
10. Multiple Pixly tools can be active simultaneously without conflict (e.g. running Distance Meter on top of placeholders).

## Happy Paths

### Scenario 1: Activate the tool on a page with broken images

1. The user opens a page that contains a mix of valid and broken `<img>` elements.
2. The user opens the Pixly popup and toggles **Fix broken images** on.
3. The tool scans every `<img>` in the page.
4. For each `<img>` whose natural dimensions are zero, or that previously fired an `error` event, a visual placeholder is rendered in its place.
5. Each placeholder shows the element's rendered dimensions in the format `width×height` and a truncated version of the original `src` URL below.
6. Valid images remain untouched.
7. The popup reflects the tool as active.

### Scenario 2: Deactivate the tool

1. While the tool is active and placeholders are visible, the user toggles **Fix broken images** off from the popup.
2. All placeholder overlays are removed.
3. Every previously-affected `<img>` returns to its natural broken state (browser default broken-image rendering).
4. No leftover styles, attributes, or DOM nodes remain from the tool.

### Scenario 3: Broken image appears after activation (SPA / lazy load)

1. The tool is already active on a page.
2. The user scrolls down or navigates within the SPA, causing new `<img>` elements to be added to the DOM.
3. A new image fails to load.
4. The tool detects the new element, evaluates it, and applies a placeholder without requiring the user to re-toggle the tool.

### Scenario 4: Reload the page with the tool persisted

1. The user has the tool active and reloads the page.
2. After reload, the tool re-initializes automatically.
3. Once the document has loaded and images have had a chance to resolve, the placeholders are applied to all broken `<img>` elements.

### Scenario 5: Inspect placeholder details

1. Placeholders are visible on the page.
2. The user reads the dimensions shown on a placeholder (e.g. `800×600`) and the truncated URL underneath (e.g. `…/assets/hero-banner.jpg`).
3. The user uses this information to identify which asset is failing and at what intended size.

### Scenario 6: Activate via keyboard shortcut

1. The user presses the configured keyboard shortcut.
2. The tool toggles between active and inactive states identically to toggling from the popup.

## Sad Paths

### Scenario 1: Image is hidden via `display: none` or `visibility: hidden`

1. The page contains a broken `<img>` that is hidden via CSS.
2. The tool ignores the element because it does not affect the visible layout.
3. No placeholder is rendered for it.

### Scenario 2: Image has zero rendered dimensions (no width/height set, no content)

1. A broken `<img>` has no intrinsic dimensions and no width/height attributes or CSS, so the browser renders it at 0×0.
2. The tool renders a placeholder at a minimum default size (e.g. 50×50) so the user can see that a broken image exists.
3. The placeholder shows the actual rendered dimensions (which may be the minimum) and the truncated URL.

### Scenario 3: Image is inside a cross-origin iframe

1. The page embeds a cross-origin iframe that contains broken images.
2. The tool cannot access the iframe's DOM due to browser security restrictions.
3. The tool ignores the iframe and processes only same-origin content. No error is shown to the user.

### Scenario 4: Image is still loading when the tool activates

1. The user activates the tool while one or more images are mid-load.
2. The tool waits for each in-flight image to fire `load` or `error` before deciding if it is broken.
3. If the image ultimately loads successfully, no placeholder is applied.
4. If it fails, a placeholder is applied once the failure is confirmed.

### Scenario 5: Content Security Policy blocks style injection

1. The page enforces a CSP that prevents the tool from injecting the styles required to render placeholders.
2. The tool detects that placeholders cannot be applied and aborts silently.
3. No JavaScript errors are surfaced in the page's console.
4. The popup may indicate that the tool was activated but had no effect (open question — see below).

### Scenario 6: Page contains hundreds of images

1. The page contains a very large number of `<img>` elements (e.g. an image gallery).
2. The tool processes images efficiently and does not block the main thread for a perceptible amount of time.
3. Off-screen images are evaluated lazily (only when they enter the viewport) to avoid an upfront performance hit.
4. The user experiences no noticeable jank when activating the tool.

### Scenario 7: Image src changes after a placeholder has been applied

1. An image had a placeholder applied because its initial `src` was broken.
2. The page's JavaScript updates the `src` to a valid URL and the image loads successfully.
3. The tool detects the successful load and removes the placeholder.

### Scenario 8: Tool is disabled while images are still being scanned

1. The user activates the tool, and the initial scan is in progress.
2. Before the scan finishes, the user deactivates the tool.
3. Any placeholders applied so far are cleaned up.
4. No further placeholders are applied.

## Business Rules

1. **Broken image criteria**: an `<img>` is considered broken if any of the following is true:
   - It has completed loading and `naturalWidth` is `0`.
   - It fired an `error` event.
   - Its `src` is empty or missing while it is rendered (open question — see below).
2. **Layout preservation**: placeholders must never alter the rendered geometry of the page. The outer dimensions, margins, position, and any property that affects neighboring elements must remain identical to the natural rendering of the original `<img>`.
3. **CSS property inheritance**: placeholders must visually inherit the shape and clipping of the original element, including `border-radius`, `object-fit`, `clip-path`, and `box-shadow`, so that they appear as a stylistically consistent stand-in.
4. **Non-destructive**: the tool must not mutate the original `<img>` element's `src`, `srcset`, or any attribute that the page's own scripts may rely on. The original element remains in the DOM.
5. **Placeholder appearance**:
   - Solid neutral background using a token from Pixly's design system (light gray equivalent).
   - 1px subtle border to ensure visibility on any background.
   - Centered two-line label: first line is `width×height` (rendered, integer pixels), second line is the truncated URL.
6. **URL truncation**: the URL displayed is truncated from the start, keeping the last N characters (default to be confirmed during settings design). If the URL is shorter than the limit, it is shown in full.
7. **Minimum placeholder size**: when the image renders at less than the configured minimum (e.g. 50×50), the placeholder is drawn at the minimum size but only if doing so does not alter the page's layout. If enlarging would push other elements, the placeholder stays at the original size and the text label is hidden or truncated.
8. **Toggle symmetry**: deactivating the tool must produce the exact same DOM state that existed before activation, modulo any natural changes the page itself made in the meantime.
9. **Multi-tool coexistence**: the tool's overlay must not interfere with other Pixly tools' overlays or interaction layers.
10. **Persistence**: enabled/disabled state is stored per-tab (or globally, consistent with other Pixly tools — confirm with existing tool behavior) and survives reloads.
11. **Scope**: only HTML `<img>` elements are in scope. CSS `background-image` failures are explicitly out of scope for this iteration.
12. **Configurable defaults**: at minimum, the placeholder background color and URL truncation length should be exposed as user-configurable settings (defaults to be defined during design).
13. **Keyboard shortcut**: the suggested default keyboard shortcut is `Alt+B`. The user can reconfigure it from the same place other tool shortcuts are configured.
14. **Internal tool identifier**: the tool is registered under a stable identifier (suggested: `broken-images`) so it can be referenced by storage, popup, and shortcut configuration.
15. **User-facing label**: the tool is displayed as **Fix broken images** in the popup, in English, consistent with the rest of the project's UI from v0.3 onward.

## Testing Approach

### Unit Tests

- Broken-image detection logic: given an `<img>` in various states (loaded successfully, loaded with `naturalWidth === 0`, fired error, still loading, no `src`), correctly classify each as broken or not.
- URL truncation: given URLs of various lengths and a max-length configuration, produce the expected truncated string (with leading ellipsis when truncation occurs, full URL otherwise).
- Minimum-size logic: given an image with given rendered dimensions and a configured minimum, produce the placeholder dimensions and decide whether the text label fits.
- Placeholder style derivation: given an original `<img>`'s computed styles, produce the set of style declarations the placeholder overlay must adopt to visually match (border-radius, object-fit, etc.).
- State machine for tool activation: scan, watch, deactivate, and cleanup transitions behave correctly for a synthetic tree of images.

### Feature Tests

- End-to-end activation on a fixture page containing a mix of valid and broken images: verify placeholders appear only on broken ones and that valid images are untouched.
- End-to-end deactivation: after toggling off, the DOM is byte-equivalent to the pre-activation state (no leftover style nodes, attributes, or overlays).
- Mutation handling: a broken image is appended to the DOM after activation and receives a placeholder without a re-toggle.
- Late-loading: an image is still in-flight when the tool activates and is later evaluated correctly after its load/error event.
- Hidden images: broken images with `display: none` or `visibility: hidden` do not receive placeholders.
- Reload persistence: when the tool is enabled and the page reloads, placeholders reappear automatically on broken images.
- Coexistence: activating Distance Meter or another overlay tool on top of broken-image placeholders does not break either tool.
- Settings round-trip: changing the placeholder background color and URL truncation length in settings is reflected on the next render.

### Manual Tests

- Visual fidelity across image variants: verify placeholders look correct for images with `border-radius`, circular avatars, images with `object-fit: cover`, images with `box-shadow`, images inside flex/grid containers, images with margins/padding.
- Cross-site smoke test: activate the tool on real-world sites (news sites, e-commerce, design portfolios) and confirm no unintended visual changes to valid images.
- Performance: activate the tool on a page with hundreds of images and confirm there is no noticeable freeze; placeholders for off-screen images appear smoothly as the user scrolls.
- CSP-protected pages: visit a page with a strict CSP and confirm the tool either applies cleanly or fails silently without polluting the console.
- Keyboard shortcut: confirm the default shortcut toggles the tool and that reconfigured shortcuts also work.
- Popup UX: confirm the tool's toggle, label, and any settings inputs match the visual style of other tools.
- Edge cases: pages with `<picture>` elements, `srcset`, lazy-loaded images using `loading="lazy"`, and images inside Shadow DOM (open question — see below).

## Out of Scope

- **CSS `background-image` failures**: detecting and replacing broken CSS background images is not part of this iteration. Only HTML `<img>` elements are processed. Reason: there is no native error event for background images, making detection significantly more complex and likely to produce false positives.
- **`<picture>` element advanced handling**: while a `<picture>` element's selected `<img>` will be processed like any other `<img>`, source-set negotiation, art-direction, and `<source>` fallback inspection are not specifically handled beyond what the browser already resolves.
- **SVG `<image>` and `<use>` references**: not in scope.
- **Cross-origin iframes**: out of scope due to browser security restrictions. No attempt to detect or report broken images inside them.
- **Reporting / exporting a list of broken images**: this iteration is purely visual. A list view, CSV export, or DevTools-style panel of broken images is not included.
- **Automatic retry**: the tool does not attempt to reload broken images.
- **Replacing images with user-provided URLs or local files**: only generic placeholders are rendered.

## Open Questions

1. **Empty/missing `src`**: should an `<img>` with no `src` (or an empty `src`) be treated as broken, or ignored? It may indicate a developer placeholder rather than a real failure.
2. **Storage scope**: is the tool's enabled state stored globally (applies to all tabs) or per-tab? Confirm against how existing Pixly tools behave to stay consistent.
3. **Shadow DOM penetration**: should the tool descend into open Shadow DOM trees on the page to find broken images inside web components?
4. **CSP fallback messaging**: when the tool cannot apply styles due to CSP, should the popup show a warning indicator, or should the failure be completely silent?
5. **Settings location**: should placeholder color and URL truncation length be exposed in a per-tool settings panel, in a global Pixly settings page, or both?
6. **Default URL truncation length**: what is the right default number of characters to display? (Suggestion: 40, but to be validated by design.)
7. **Default placeholder color**: which Pixly design token should be used? Confirm with the design system.
8. **Keyboard shortcut conflict check**: is `Alt+B` free across all existing Pixly tools? If not, propose an alternative.
9. **Behavior on `src` change**: when a previously broken image's `src` changes and the new URL is still loading, should the placeholder remain until the new load resolves, or be removed immediately?
