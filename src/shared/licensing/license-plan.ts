import { TOOL_ID, type ToolId } from '@shared/constants';

/**
 * Licensing model, kept free of chrome.* APIs so plan rules are unit-testable. Three plans:
 *
 * - 'trial': the first {@link TRIAL_DURATION_DAYS} days after install. Every tool works.
 * - 'pro':   a Gumroad license key was activated and its last definitive verification is valid.
 * - 'free':  trial over and no valid license. Only {@link FREE_TOOL_IDS} stay usable.
 *
 * Verification results are only stored when definitive (Gumroad answered yes or no). An offline
 * or failing check never downgrades a paying user — the previous verdict stands (grace).
 */

export const TRIAL_DURATION_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tools that stay usable on the free plan once the trial ends. */
export const FREE_TOOL_IDS: ReadonlySet<ToolId> = new Set<ToolId>([
  TOOL_ID.fixBrokenImages,
  TOOL_ID.globalOutlines,
  TOOL_ID.gridOverlay,
]);

export function isProTool(toolId: ToolId): boolean {
  return !FREE_TOOL_IDS.has(toolId);
}

/** Last definitive Gumroad verdict for the stored key. Indeterminate checks are never stored. */
export interface StoredVerification {
  valid: boolean;
  checkedAtIso: string;
  /** Human-readable cause when invalid (refunded, key not found, ...). */
  reason?: string;
}

/** Persisted licensing document (chrome.storage.local, see license-store). */
export interface LicenseDocument {
  /** ISO timestamp of the trial start; null until the service worker seeds it on install. */
  trialStartedAtIso: string | null;
  licenseKey: string | null;
  verification: StoredVerification | null;
}

export function createEmptyLicenseDocument(): LicenseDocument {
  return { trialStartedAtIso: null, licenseKey: null, verification: null };
}

export type Plan = 'pro' | 'trial' | 'free';

export interface PlanInfo {
  plan: Plan;
  /** Whole days of trial remaining (rounded up); 0 unless plan === 'trial'. */
  trialDaysLeft: number;
}

export function computePlan(doc: LicenseDocument, nowMs: number): PlanInfo {
  if (doc.licenseKey && doc.verification?.valid) {
    return { plan: 'pro', trialDaysLeft: 0 };
  }

  if (doc.trialStartedAtIso) {
    const endsAtMs = Date.parse(doc.trialStartedAtIso) + TRIAL_DURATION_DAYS * DAY_MS;

    if (Number.isFinite(endsAtMs) && nowMs < endsAtMs) {
      return { plan: 'trial', trialDaysLeft: Math.ceil((endsAtMs - nowMs) / DAY_MS) };
    }
  }

  return { plan: 'free', trialDaysLeft: 0 };
}

/** The purchase fields of Gumroad's verify response that decide validity. */
export interface GumroadPurchase {
  refunded?: boolean;
  chargebacked?: boolean;
  /** Seats bought at checkout (multi-seat product); 1 for a plain purchase. */
  quantity?: number;
  /** Membership products only; null/absent for one-time purchases. */
  subscription_ended_at?: string | null;
  subscription_cancelled_at?: string | null;
  subscription_failed_at?: string | null;
}

/** Body of a POST /v2/licenses/verify response (both the 200 and 404 shapes). */
export interface GumroadVerifyBody {
  success?: boolean;
  message?: string;
  /** Times the key was verified with increment_uses_count=true — Pixly's activation counter. */
  uses?: number;
  purchase?: GumroadPurchase;
}

export type VerificationOutcome =
  | { valid: true; uses: number | null; quantity: number }
  | { valid: false; reason: string };

/** Devices one purchased seat may activate: the $10 license covers 2 machines. */
export const ACTIVATIONS_PER_SEAT = 2;

/** Max device activations for a purchase (quantity is pre-normalized to a positive integer). */
export function maxActivations(quantity: number): number {
  return quantity * ACTIVATIONS_PER_SEAT;
}

/**
 * Maps a Gumroad verify HTTP response to a definitive outcome, or null when the response is
 * indeterminate (server error, unexpected shape) and must not change the stored verdict.
 */
export function interpretVerifyResponse(
  status: number,
  body: GumroadVerifyBody | null,
): VerificationOutcome | null {
  // Gumroad answers 404 for keys that do not exist on the product — definitive, not "not found".
  if (status === 404) {
    return { valid: false, reason: body?.message ?? 'License key not found for this product.' };
  }

  if (status !== 200 || body === null) {
    return null;
  }

  if (body.success !== true) {
    return { valid: false, reason: body.message ?? 'Gumroad rejected this license key.' };
  }

  const purchase = body.purchase;

  if (!purchase) {
    return null;
  }

  if (purchase.refunded) {
    return { valid: false, reason: 'This purchase was refunded.' };
  }

  if (purchase.chargebacked) {
    return { valid: false, reason: 'This purchase was charged back.' };
  }

  // Pixly sells as a one-time purchase today; these guard a future switch to memberships.
  if (
    purchase.subscription_ended_at ||
    purchase.subscription_cancelled_at ||
    purchase.subscription_failed_at
  ) {
    return { valid: false, reason: 'The subscription is no longer active.' };
  }

  return {
    valid: true,
    uses: typeof body.uses === 'number' ? body.uses : null,
    quantity:
      typeof purchase.quantity === 'number' && purchase.quantity >= 1
        ? Math.floor(purchase.quantity)
        : 1,
  };
}
