# Overlay Essentials — Resize, Keyboard Nudge & Lock Position

## General Description

The `ImageOverlayTool` is Pixly's visual comparison tool that lets a developer load a design image (typically exported from Figma) and superimpose it over the live page to verify how closely the implementation matches the design. The current version supports loading the image, adjusting opacity, dragging with the mouse, switching blend modes, and persisting state across tabs.

In real day-to-day use, three frictions consistently break the pixel-perfect comparison workflow:

1. Figma exports never match the live viewport dimensions (1x/2x/3x exports, 1440px designs vs. 1280px viewports, mobile mockups dropped into a desktop window), so the overlay needs to be resized before it is useful.
2. Mouse drag is great for coarse alignment but not for sub-pixel precision — keyboard nudging is the de-facto industry pattern for fine alignment.
3. Once the overlay is aligned, any accidental click-and-drag breaks the alignment and forces the user to redo the work; users want to lock the overlay in place while they inspect details.

This specification covers three additive improvements to `ImageOverlayTool`: aspect-ratio-aware **resize handles**, **keyboard nudging**, and a **lock-position toggle**. All three improvements preserve the existing overlay behavior (load, opacity, drag, blend modes, snapshot, persistence) and integrate cleanly with the existing "Image overlay" tab in the popup.

## User Stories

- As a developer comparing a Figma export against my implementation, I want to resize the overlay (with the aspect ratio locked by default) so that the design image matches the actual viewport dimensions before I start comparing pixels.
- As a developer who has the overlay roughly aligned, I want to nudge it one pixel at a time with the arrow keys so that I can achieve pixel-perfect alignment without fighting my mouse.
- As a developer who has finished aligning the overlay, I want to lock the overlay in place so that I can move my cursor around the page to inspect details without accidentally dragging the overlay out of alignment.

## Acceptance Criteria

1. When an overlay is visible and unlocked, four resize handles appear at its corners.
2. Dragging a corner handle resizes the overlay while preserving the original image's aspect ratio.
3. Holding **Shift** while dragging a corner handle resizes the overlay freely (aspect ratio unlocked) for the duration of that drag.
4. During a resize, the overlay's current `width x height` (in CSS pixels) is shown as a tooltip near the cursor or handle.
5. During a resize, the scale percentage relative to the image's natural size is shown alongside the dimensions (e.g. `1280 x 720 — 89%`).
6. When the user is dragging a corner handle and the scale approaches 100% (within a small threshold), the overlay snaps to its natural size.
7. Resize anchors the overlay to the corner opposite the active handle — i.e., the opposite corner does not move.
8. When the overlay is visible, unlocked, and "selected" (the user has clicked on it), the arrow keys move it by 1 px per key press.
9. Holding **Shift** while pressing an arrow key moves the overlay by 10 px per key press.
10. Pressing **Escape**, or clicking anywhere outside the overlay, deselects it and stops keyboard nudging.
11. A subtle visual indicator (e.g., a brighter or thicker border) signals when the overlay is selected.
12. A lock toggle is present in the "Image overlay" tab of the popup; toggling it locks or unlocks the overlay.
13. When the overlay is locked: resize handles are hidden or disabled, mouse drag does not move the overlay, keyboard nudging is disabled, and the cursor over the overlay reflects the locked state.
14. The keyboard shortcut **Alt+L** toggles the lock state from anywhere on the page while the `ImageOverlayTool` is active.
15. The overlay's position, scale (width and height), and lock state persist across tab switches and full page reloads, just like the existing opacity and visibility state.
16. Snapshot and side-by-side capture the overlay at its current scaled size and position.
17. The current scale (e.g., `100%`, `150%`) is visible in the popup at all times when an overlay is loaded.
18. The three features compose correctly: resize and keyboard nudge can be used together without conflict; lock disables both resize and nudge.

## Happy Paths

### Scenario 1: Resizing a Figma 2x export to match the viewport

1. The user loads a Figma image exported at 2x (e.g., 2880 x 1620) into the overlay.
2. The overlay appears at its natural size, with four corner handles visible.
3. The user grabs the bottom-right handle and drags it inward.
4. As the user drags, the aspect ratio is preserved and a tooltip near the handle shows `1440 x 810 — 50%`.
5. When the user releases the mouse, the overlay stays at the new size.
6. The popup's scale badge updates to `50%`.

### Scenario 2: Snapping to 100% during resize

1. The user is dragging a corner handle and shrinks the overlay below its natural size.
2. The user drags back outward; as the scale approaches 100% (within the snap threshold), the overlay jumps to exactly 100%.
3. The tooltip momentarily shows `100%` highlighted (visually distinct from non-snapped values) to confirm the snap.
4. To resize past 100%, the user keeps dragging outward beyond the snap threshold; the overlay leaves the snap and continues resizing normally.

### Scenario 3: Free aspect-ratio resize with Shift

1. The user grabs a corner handle.
2. The user presses and holds **Shift** while dragging.
3. While Shift is held, the overlay resizes freely (width and height independent).
4. When the user releases the mouse (regardless of Shift state), the new free dimensions are committed.

### Scenario 4: Pixel-perfect keyboard nudge

1. The user has the overlay roughly aligned via mouse drag.
2. The user clicks on the overlay to select it; the selection border appears.
3. The user presses **Right Arrow** three times; the overlay moves 3 px to the right.
4. The user presses **Shift + Down Arrow** once; the overlay moves 10 px down.
5. The user presses **Escape**; the selection border disappears, arrow keys no longer affect the overlay, and the new position is persisted.

### Scenario 5: Locking after alignment

1. The user has the overlay perfectly aligned (position and scale).
2. The user clicks the lock toggle in the popup.
3. The lock icon switches to its locked state and the popup confirms `Locked` (text or visual cue).
4. Resize handles on the overlay disappear.
5. The user moves the cursor over the overlay; the cursor renders as `default` (or `not-allowed`).
6. The user tries to drag the overlay; nothing happens (a subtle visual hint is shown, see sad paths).
7. The user closes the popup, switches tabs, returns; the overlay is still locked in the same position and scale.

### Scenario 6: Quick lock toggle with keyboard

1. The user has the `ImageOverlayTool` active with an overlay loaded and unlocked.
2. The user presses **Alt + L**.
3. The overlay becomes locked; the popup's lock toggle reflects the new state.
4. The user presses **Alt + L** again to unlock.

### Scenario 7: Resize then keyboard nudge

1. The user resizes the overlay to 75%.
2. Without leaving the page, the user clicks the overlay to select it.
3. The user nudges it 5 px to the left using arrow keys.
4. Both the scale (75%) and the new position are persisted on the next reload.

## Sad Paths

### Scenario 1: Resizing past the upper cap

1. The user drags a corner handle outward aggressively, beyond a reasonable scale (e.g., > 500% of natural size).
2. The overlay stops growing at the configured maximum scale.
3. The tooltip shows the capped dimensions and `MAX` (or similar visual cue) so the user knows they hit the limit.

### Scenario 2: Resizing below the lower cap

1. The user drags a corner handle inward to make the overlay tiny.
2. The overlay stops shrinking when its smallest side reaches the minimum dimension (50 px).
3. The tooltip shows the capped dimensions and `MIN`.

### Scenario 3: Resize that would push the overlay off-screen

1. The overlay is positioned near the right edge of the viewport.
2. The user resizes it larger; the new size would push it entirely outside the viewport.
3. The overlay is automatically repositioned (clamped) so that at least 50 px of it remains visible inside the viewport.

### Scenario 4: User drags a locked overlay

1. The overlay is locked.
2. The user clicks and drags on the overlay.
3. The overlay does not move.
4. A subtle, non-intrusive visual hint is shown briefly (e.g., the lock icon on the popup pulses, or a faint lock badge fades in over the overlay for ~1s).
5. No error toast or modal is shown — the feedback is informational, not aggressive.

### Scenario 5: Keyboard arrows pressed while overlay is locked

1. The overlay is locked and the user clicks on it.
2. No selection border appears (because selection is disabled while locked).
3. Pressing arrow keys does nothing to the overlay.
4. Arrow keys continue to behave normally for the rest of the page (e.g., scrolling).

### Scenario 6: Keyboard nudge while typing in an input field

1. The user clicks the overlay and selects it.
2. The user then focuses an `<input>`, `<textarea>`, or `contenteditable` element on the page.
3. Arrow keys go to the input, not the overlay.
4. To re-enable keyboard nudge, the user clicks the overlay again.

### Scenario 7: Click conflict with another active tool (e.g., Inspector)

1. The user has both `Inspector` and `ImageOverlayTool` active.
2. The user clicks on a region that is covered by the overlay.
3. The `ImageOverlayTool` claims the click for overlay selection / drag (overlay always wins clicks within its bounds while it is visible and unlocked).
4. If the user wants the Inspector to receive the click, they must either lock the overlay (which makes it click-transparent in the user's mental model — see open questions), hide the overlay, or move it out of the way.

### Scenario 8: Snapshot taken while resize is in progress

1. The user starts dragging a resize handle.
2. Before releasing the mouse, the user triggers a snapshot via the popup.
3. The in-progress resize is committed first (as if the user had released the mouse), then the snapshot is taken at the now-final size and position.

### Scenario 9: Image natural dimensions are very small

1. The user loads a tiny image (e.g., 64 x 64 px).
2. The user resizes it up to the maximum scale (500%).
3. Above 500% the overlay stops growing; the tooltip indicates `MAX`.
4. The user can still nudge and use blend modes normally at the capped size.

### Scenario 10: User changes window size after resizing

1. The user resizes the overlay and aligns it inside a 1440 px viewport.
2. The user resizes the browser window down to 800 px.
3. The overlay keeps its absolute width, height, and position; it does not auto-scale to the new viewport.
4. If the overlay would now be entirely outside the visible area, the clamp rule from Sad Path 3 brings at least 50 px back into view.

## Business Rules

1. **Aspect ratio default:** Corner-handle drag preserves aspect ratio by default. Free resize requires the user to hold **Shift** during the drag.
2. **Resize anchor:** The corner opposite the active handle is the anchor and does not move during resize.
3. **Snap to natural size:** When the user drags through 100% scale, the overlay snaps to 100% within a small threshold (e.g., within ±3% of natural size).
4. **Scale bounds:** The overlay scale is clamped between a minimum and a maximum. Minimum is whichever scale yields a 50 px shortest side (or absolute 50 px). Maximum scale is 500% of the natural size.
5. **Viewport visibility:** After any resize or nudge, at least 50 px of the overlay must remain visible inside the viewport; if not, the position is automatically clamped.
6. **Nudge granularity:** Plain arrow keys move 1 px. Shift + arrow moves 10 px. No other modifier is recognized for now (see open questions).
7. **Selection model:** The overlay is "selected" when the user clicks on it and remains selected until the user (a) clicks outside it, (b) presses Escape, or (c) loses focus to an editable element. Selection is required for keyboard nudge.
8. **Lock disables interaction:** When locked, mouse drag, resize handles, and keyboard nudge are all disabled. Opacity, blend mode, visibility toggle, snapshot, and image replacement remain available.
9. **Lock keyboard shortcut:** **Alt + L** toggles lock state, but only while the `ImageOverlayTool` is the active tool and the focus is not on an editable element.
10. **Persistence scope:** Position (x, y), scale (width, height), and lock state are persisted per overlay-image session, alongside the existing persisted state (image data, opacity, visibility, blend mode). They survive tab switches and page reloads.
11. **Snapshot fidelity:** Snapshot and side-by-side capture the overlay exactly as it appears on screen, including current scaled dimensions and position.
12. **Scale display:** The popup always shows the current scale as a percentage (rounded to the nearest integer) when an overlay is loaded. During resize, the same percentage is shown in the tooltip near the active handle.
13. **Tool interactions:** While the `ImageOverlayTool` is active and the overlay is visible and unlocked, clicks within the overlay bounds are consumed by the overlay (for selection and drag), not by other Pixly tools. When the overlay is hidden, locked, or `ImageOverlayTool` is inactive, clicks pass through to whatever tool is active.
14. **Free-aspect indicator:** When the user is resizing with Shift held, the tooltip explicitly indicates the aspect ratio is unlocked (e.g., `1240 x 700 — free`).
15. **Composability:** The three features compose: resize can be followed by nudge without losing the resize result; locking can be applied to any combination of position and scale; unlocking restores all interactions.

## Testing Approach

### Unit tests

- Aspect-ratio preservation: given an initial width/height and a delta on a corner handle, the resulting width/height matches the original ratio within a sub-pixel tolerance.
- Free-aspect resize: when "free" mode is on, width and height update independently of the original ratio.
- Snap to 100%: when the resized scale falls within the snap threshold of 100%, the output is exactly natural size.
- Min/max scale clamps: scale below the minimum returns the minimum; scale above the maximum returns the maximum.
- Resize anchor math: dragging the bottom-right handle keeps the top-left corner fixed; the other three handles behave symmetrically.
- Viewport clamp: given an overlay position and size that would leave less than 50 px visible, the clamping function returns a position where exactly 50 px (or more) is visible.
- Nudge math: 1 px for plain arrow, 10 px for Shift + arrow, correct sign per direction.
- Persistence serialization/deserialization round-trip for `position`, `scale`, and `lockState`.

### Feature tests (integration / end-to-end)

- Load an image, resize via the bottom-right handle, verify final dimensions and that the top-left corner did not move.
- Load an image, hold Shift while resizing, verify aspect ratio is not preserved.
- Resize an overlay, switch tabs, return: the overlay's size and position are restored.
- Click an overlay to select it, press Right Arrow 5 times, verify the overlay moved 5 px right.
- Press Escape after selection, verify arrow keys no longer move the overlay.
- Lock the overlay via the popup toggle, attempt to drag it, verify it does not move.
- Lock with **Alt + L**, verify the popup toggle reflects the locked state.
- Lock state survives a full page reload.
- Take a snapshot while the overlay is resized to 75% — the snapshot includes the overlay at 75%, at the current position.
- Compose: resize to 80%, nudge 3 px left, lock, reload — final state matches expectations.

### Manual tests

- Visual quality of the resize handles (size, contrast against varying page backgrounds, hit area large enough to grab easily).
- Tooltip readability and positioning during resize (does not flicker, does not get clipped at viewport edges).
- Snap-to-100% feel: the snap should feel intentional, not jittery. Validate the threshold ergonomically.
- Selection border visibility against busy page backgrounds and varying overlay opacities.
- Lock toggle icon clarity (locked vs. unlocked state distinguishable at a glance).
- Cursor state over a locked overlay matches expectations (default or not-allowed; pick whichever feels least alarming).
- Subtle feedback when the user tries to drag a locked overlay — confirm it is informational, not annoying after repeated triggers.
- Alt + L does not collide with browser-level or OS-level shortcuts on macOS, Windows, and Linux Chrome.
- Resize and nudge with very small images, very large images, very tall images, and very wide images — handles and tooltip behave reasonably.
- Side-by-side view honors the scaled overlay (no surprises in the captured composition).

## Out of Scope

The following overlay improvements are explicitly **not** part of this specification:

- Hotkey toggle for overlay visibility.
- Snap-to-viewport options (center, fit-to-width, fit-to-height).
- Click-through mode using a modifier key.
- Coordinate crosshair / measurement readout on hover.
- Save / load named overlay presets.
- Reset position/scale button. (If the implementing developer finds it trivial to add a "Reset" button that returns the overlay to its initial position and natural size, they may include it — but it is not a requirement of this spec.)
- Any change to opacity, blend modes, image loading, or the existing persistence layer beyond extending it with the three new fields (position-x, position-y, scale-width, scale-height, lock-state).
- Mobile / touch-input handling for resize (Pixly is a desktop Chrome extension).

## Open Questions

1. **Snap threshold value:** What is the right tolerance for snap-to-100%? Suggested default: ±3% of natural size, but should be validated manually.
2. **Maximum scale cap:** Is 500% the right upper bound, or should it be smaller (e.g., 300%) to discourage unusable comparisons?
3. **Visible-minimum value:** The spec assumes 50 px as the minimum visible area inside the viewport. Should this be configurable, or fixed?
4. **Locked overlay click-through:** When the overlay is locked, should clicks pass through to underlying tools (Inspector, page elements) or should they still be intercepted? Recommendation: locked = click-transparent, so users can lock the overlay and continue inspecting underneath without hiding it. To be confirmed.
5. **Free-aspect UI affordance:** The spec uses Shift-during-drag as the primary way to free the aspect ratio. Should there also be a sticky toggle button in the popup (for users who prefer not to hold a modifier), or is Shift sufficient? Recommendation: ship Shift-only first; add a sticky toggle later only if users ask for it.
6. **Selection persistence:** Should the selection state (overlay-is-selected) persist across page reloads, or always reset on reload? Recommendation: reset on reload — selection is a transient interaction state, not a configuration.
7. **Alt + L collision:** Confirm that Alt + L does not collide with any commonly used Chrome or website shortcut. If it does, fall back to a different combo (e.g., Alt + K).
8. **Tooltip placement during resize:** Should the tooltip follow the cursor, or be anchored to the active handle? Recommendation: anchored to the active handle, offset outward so it never sits underneath the cursor.
9. **Nudge while multiple Pixly tools are active:** If a future tool also listens for arrow keys, what is the precedence? Recommendation: the most recently activated tool with a selected target wins; document this as a general Pixly interaction rule.
