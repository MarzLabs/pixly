import type { Result } from '@shared/types';
import {
  interpretVerifyResponse,
  type GumroadVerifyBody,
  type VerificationOutcome,
} from './license-plan';

/**
 * Gumroad product identity. The verify endpoint rejects the legacy product_permalink for this
 * product ("The 'product_id' parameter is required...") and demands this opaque id, which Gumroad
 * echoes as `purchase.product_id` in verify responses. The product must have "Generate a unique
 * license key per sale" enabled in its settings for /licenses/verify to work.
 */
export const GUMROAD_PRODUCT_ID = 'z33UKg4raNoN4K3cZnUQEA==';

/** Public checkout page opened from the popup's upgrade links. */
export const GUMROAD_PRODUCT_URL = 'https://marzlabs.gumroad.com/l/pixly';

const VERIFY_ENDPOINT = 'https://api.gumroad.com/v2/licenses/verify';

/**
 * Calls Gumroad's license verification API (no auth token needed for this endpoint). Returns
 * ok:false when the check was indeterminate (offline, Gumroad down) — callers must keep the
 * previous stored verdict in that case rather than downgrading a paying user.
 *
 * incrementUsesCount must be false for background re-checks so the Gumroad "uses" counter keeps
 * meaning "activations", not "checks".
 */
export async function verifyLicenseWithGumroad(
  licenseKey: string,
  options: { incrementUsesCount: boolean },
): Promise<Result<VerificationOutcome>> {
  const params = new URLSearchParams({
    product_id: GUMROAD_PRODUCT_ID,
    license_key: licenseKey,
    increment_uses_count: String(options.incrementUsesCount),
  });

  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const body = (await response.json().catch(() => null)) as GumroadVerifyBody | null;
    const outcome = interpretVerifyResponse(response.status, body);

    return outcome
      ? { ok: true, data: outcome }
      : { ok: false, error: 'Gumroad did not give a definitive answer. Try again later.' };
  } catch {
    return { ok: false, error: 'Could not reach Gumroad. Check your connection and try again.' };
  }
}
