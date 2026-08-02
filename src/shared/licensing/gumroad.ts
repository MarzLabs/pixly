import type { Result } from '@shared/types';
import {
  interpretVerifyResponse,
  type GumroadVerifyBody,
  type VerificationOutcome,
} from './license-plan';

/**
 * Gumroad product identity. The permalink is the short code in the product URL — the same slug
 * that appears in the product's edit URL on gumroad.com. The product must have "Generate a
 * unique license key per sale" enabled in its settings for /licenses/verify to work.
 */
export const GUMROAD_PRODUCT_PERMALINK = 'jgeirw';

/** Public checkout page opened from the popup's upgrade links. */
export const GUMROAD_PRODUCT_URL = `https://gumroad.com/l/${GUMROAD_PRODUCT_PERMALINK}`;

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
    product_permalink: GUMROAD_PRODUCT_PERMALINK,
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
