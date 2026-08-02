# Pixly — Privacy Policy

_Last updated: 2026-08-02_

Pixly is a Chrome extension providing visual web-development tools (image overlays, grids,
rulers, measurements, screenshots and annotations). It is built to work locally: **your browsing
data never leaves your machine.**

## What Pixly stores

- **Tool configuration** (which tools are enabled per site, their settings, toolbar position,
  trial start date) — stored locally in `chrome.storage.local` / `chrome.storage.sync`.
- **Images you provide** (design overlays you drop or paste, page snapshots you capture) —
  stored locally in your browser's IndexedDB. They are never uploaded anywhere.
- **Your license key**, if you buy Pixly Pro — stored locally in `chrome.storage.local`.

## What Pixly transmits

Exactly one thing, to exactly one place: when you activate a Pro license (and in a periodic
background re-check), Pixly sends **your license key** to Gumroad's license verification API
(`api.gumroad.com`) to confirm the purchase is valid. Gumroad's own privacy policy is at
<https://gumroad.com/privacy>.

Pixly does **not**:

- collect analytics or telemetry of any kind;
- read, store or transmit the content of pages you visit;
- transmit your captures, overlays, settings or any browsing data;
- share or sell any data to third parties;
- use remote code.

## Permissions

Pixly asks for the minimum it needs: `activeTab`/`scripting` to act on the tab you invoke it on,
`storage` for local settings, `alarms` for the periodic license re-check, and host access to
`api.gumroad.com` for license verification only. Per-site host access is optional and requested
only when you enable a capture tool on that site.

## Contact

Questions: open an issue at <https://github.com/MarzLabs/pixly/issues> or email
<marz@hey.com>.
