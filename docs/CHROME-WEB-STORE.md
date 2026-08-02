# Chrome Web Store — listing kit

Copy-paste material for the Developer Dashboard (<https://chrome.google.com/webstore/devconsole>),
plus the answers reviewers expect. Keep this in sync when permissions or features change.

## Package

- Upload the zip produced by `just release` / `just zip` (e.g. `pixly-0.10.0.zip`).
- One-time $5 developer registration fee applies to new accounts.

## Store listing

- **Name:** Pixly — Visual dev tools
- **Summary (max 132 chars):**
  Pixel-perfect web development: overlay designs, grids, rulers, measure distances, capture &
  annotate — all on the live page.
- **Category:** Developer Tools
- **Language:** English
- **Description:**

  Pixly is a toolbox for visually verifying web implementations against their designs, directly
  on the live page.

  TOOLS
  • Image Overlay — drop or paste a design export (e.g. a Figma PNG) over the page with opacity,
  blend modes (including difference) and drag/scale, to compare design vs implementation pixel
  by pixel.
  • Grid Overlay — paint your layout grid (columns, gutters, margins, baseline) over the page.
  • Rulers & Guides — pixel rulers with draggable, persistent guide lines.
  • Distance Meter — drag between two points to measure exact pixel distances, snapping to
  element edges.
  • Capture & Annotate — capture the viewport, an area or an element and mark it up with arrows,
  shapes, text and emoji; the export embeds page title, URL and time.
  • Snapshot & Compare — capture the page before a change; afterwards the capture sits over the
  page in difference blend so anything that changed glows.
  • Global Outlines — outline every element to reveal the real layout structure.
  • Fix Broken Images — replace broken images with same-size placeholders so layout review isn't
  distorted.

  Tools persist per site, survive reloads, and only run where you turn them on. All UI lives in
  an isolated Shadow DOM that never pollutes the page. Everything works locally — no analytics,
  no data collection (see the privacy policy).

  PRICING
  Free 15-day full trial. Afterwards Fix Broken Images, Global Outlines and Grid Overlay stay
  free forever; a one-time purchase unlocks everything on 2 devices.

- **Privacy policy URL:** <https://github.com/MarzLabs/pixly/blob/main/PRIVACY.md>
- **Homepage URL:** <https://github.com/MarzLabs/pixly>
- **Assets needed:** 128×128 icon (already in the package), at least one 1280×800 (or 640×400)
  screenshot; optionally a 440×280 small promo tile.

## Privacy tab answers

- **Single purpose:** Visual web-development tooling: overlay, measure, capture and inspect the
  current page to verify implementations against designs.
- **Data usage disclosure:** check **Authentication information** only (the Gumroad license key
  the user types is sent to Gumroad to validate their purchase). Everything else: not collected.
  Certify: data is not sold, not used for unrelated purposes, not used for creditworthiness.
- **Remote code:** No. All code ships in the package; the only network call is a JSON license
  check against `api.gumroad.com`.

## Permission justifications

- **activeTab + scripting** — Pixly acts only on the tab where the user invokes it (popup click
  or keyboard shortcut) to inject its tools.
- **storage** — persists per-site tool configuration, trial start and the user's license key
  locally.
- **alarms** — a daily background re-validation of the license key against Gumroad.
- **Host permission `https://api.gumroad.com/*`** — the single fixed host grant; used
  exclusively to verify the user's paid license key. No page data is ever sent.
- **Content script on `<all_urls>` + optional host permissions** — Pixly's tools persist
  per site chosen by the user (e.g. keep a grid overlay active on your staging site across
  reloads). The content script must load to check whether the current site has tools enabled;
  it renders nothing and touches nothing on sites where the user never enabled a tool.
  Persistent per-site host access is **optional**, requested only when the user enables a
  capture tool on that site.

## Review gotchas

- The `<all_urls>` content script triggers the "broad host permissions" review path — expect a
  slower (days, not hours) first review. The justification above is the answer.
- Screenshots must not show competitor branding or misleading UI.
- The Gumroad checkout link in the popup is allowed (it opens a normal tab; no payments happen
  inside the extension).
