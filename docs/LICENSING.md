# Licensing

Pixly is monetized through [Gumroad](https://marzlabs.gumroad.com/l/pixly) as a **one-time $10
purchase**. Plans:

| Plan      | When                                           | Tools                                            |
| --------- | ---------------------------------------------- | ------------------------------------------------ |
| **Trial** | First 15 days after install                    | Everything                                       |
| **Free**  | Trial over, no valid license                   | Fix Broken Images, Global Outlines, Grid Overlay |
| **Pro**   | Activated Gumroad license key (2 devices/seat) | Everything                                       |

The popup shows a slim, non-blocking banner (trial countdown or free-plan notice) with the
checkout link and a license-key form. Locked tools keep their stored per-site activation and
state, so buying Pro lights them back up without reconfiguring anything.

## Where the code lives

- `src/shared/licensing/license-plan.ts` — pure rules: plan computation, free/Pro tool split,
  Gumroad response interpretation, seat math. Covered by `tests/license-plan.test.ts`.
- `src/shared/licensing/gumroad.ts` — verify API client and product identity constants.
- `src/shared/licensing/license-store.ts` — storage I/O; the trial start is mirrored to
  `chrome.storage.sync` so a reinstall does not reset the trial (signed-in profiles).
- `src/background/service-worker.ts` — trial seeding, license activation, daily re-check alarm.
- Gating: `src/content/orchestrator.ts` (filters Pro tools on the free plan) and
  `src/popup/PopupApp.tsx` (locked tiles, banner, PRO chip).

## Gumroad product requirements

- Product id `z33UKg4raNoN4K3cZnUQEA==` (the verify endpoint **rejects** the legacy
  `product_permalink` for this product and demands `product_id`).
- Checkout page: <https://marzlabs.gumroad.com/l/pixly>.
- **"Generate a unique license key per sale" must stay enabled** on the product — without it,
  buyers receive no key and activation is impossible.
- Test purchases (`purchase.test: true`) verify exactly like real ones, so the flow can be
  exercised before the product is published.

## How activation and the seat limit work

Each purchased seat covers **2 devices** (`quantity × 2` activations). Gumroad itself does not
enforce seats; Pixly counts them through the API's `uses` counter, which only increments when we
pass `increment_uses_count=true`:

1. **Probe** (`increment_uses_count=false`): checks the key is valid (not refunded / charged
   back) and reads `uses` and `quantity`.
2. **Seat check**: if `uses >= quantity × 2`, activation is rejected — and because the probe did
   not increment, a rejected attempt never burns a seat.
3. **Commit** (`increment_uses_count=true`): consumes the seat and stores the key. Re-activating
   the key a device already holds skips the commit (idempotent).

A daily `chrome.alarms` re-check (always `increment_uses_count=false`) revokes Pro only on a
**definitive** negative answer (refund/chargeback). Network failures and server errors change
nothing — a paying user is never downgraded by a hiccup.

## Known limitations (accepted trade-offs)

These are the compromises of shipping without our own licensing backend. They are fine at this
price point; revisit if support friction grows.

1. **Seats count historical activations, not live devices.** Reinstalling the extension or
   clearing its storage and re-activating consumes a _new_ activation. A customer who does this
   twice exhausts their 2 seats while only ever using one machine.
2. **Removing a license does not free its seat.** Gumroad's decrement endpoint requires the
   vendor access token, which must never ship inside the extension (anyone could extract it).
   "Remove" in the popup only clears the key locally.
3. **Support playbook — freeing a seat** (run by the vendor, e.g. when a customer changed
   machines):

   ```bash
   curl -X PUT https://api.gumroad.com/v2/licenses/decrement_uses_count \
     -d "access_token=<token>" \
     -d "product_id=z33UKg4raNoN4K3cZnUQEA==" \
     -d "license_key=<customer key>"
   ```

   Create the access token under Gumroad → Settings → Advanced → Applications. Keep it out of
   this repo.

4. **The trial is soft enforcement.** `trialStartedAtIso` lives in the extension's own storage;
   a technical user can edit it and extend their trial. The sync mirror only survives
   reinstalls for Chrome profiles that are signed in. This is the standard trade-off for
   backend-less extensions — real enforcement would require server-side accounts.
5. **Clock changes are trusted.** Setting the system clock back extends the trial. Not worth
   defending against at this price.

If these ever become a real problem, the upgrade path is a minimal backend (e.g. a Cloudflare
Worker) keeping a per-device seat registry with true deactivation, with the Gumroad key as the
credential.

## Testing tips

- Simulate an expired trial from the service-worker console (`chrome://extensions` → Pixly →
  "service worker"):

  ```js
  chrome.storage.local.get('pixly:license:v1', (d) =>
    chrome.storage.local.set({
      'pixly:license:v1': {
        ...d['pixly:license:v1'],
        trialStartedAtIso: '2020-01-01T00:00:00Z',
      },
    }),
  );
  ```

- Probe a key without consuming a seat: run the curl above against
  `POST https://api.gumroad.com/v2/licenses/verify` with `increment_uses_count=false` (no access
  token needed for verify).
