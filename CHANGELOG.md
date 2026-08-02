# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-08-02

### Added

- Seat limit: each purchased seat covers 2 device activations, enforced through Gumroad's uses
  counter with a probe/commit flow — rejected attempts never consume a seat, and re-activating
  a key the device already holds is idempotent
- `docs/LICENSING.md`: licensing model, seat mechanics, known limitations of the backend-less
  scheme, and the vendor support playbook for freeing seats

### Fixed

- License activation always failed with "Gumroad did not give a definitive answer": Gumroad
  rejects `product_permalink` for this product and requires `product_id`, which verification
  now sends
- The "Get Pro" link now opens the canonical checkout page (`marzlabs.gumroad.com/l/pixly`)
  instead of a dead short-id URL

## [0.9.0] - 2026-08-01

### Added

- 15-day trial period for premium features
- Free tier with three tools: Fix Broken Images, Global Outlines, and Grid Overlay
- Gumroad license verification for premium feature access
- License key input form in the popup
- Daily license re-verification via service worker alarm

### Changed

- Premium tools now require a valid license (accessible via one-time purchase through Gumroad)
- Non-blocking license key banner in the popup for license management
