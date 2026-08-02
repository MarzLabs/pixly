import { describe, expect, it } from 'vitest';
import { TOOL_ID } from '@shared/constants';
import {
  computePlan,
  createEmptyLicenseDocument,
  FREE_TOOL_IDS,
  interpretVerifyResponse,
  isProTool,
  TRIAL_DURATION_DAYS,
  type LicenseDocument,
} from '@shared/licensing/license-plan';

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_START_ISO = '2026-08-01T00:00:00.000Z';
const TRIAL_START_MS = Date.parse(TRIAL_START_ISO);

function doc(overrides: Partial<LicenseDocument> = {}): LicenseDocument {
  return { ...createEmptyLicenseDocument(), trialStartedAtIso: TRIAL_START_ISO, ...overrides };
}

function verifiedDoc(valid: boolean): LicenseDocument {
  return doc({
    licenseKey: 'ABCD1234-EF567890-ABCD1234-EF567890',
    verification: { valid, checkedAtIso: TRIAL_START_ISO },
  });
}

describe('plan computation', () => {
  it('grants the full trial right after install', () => {
    const info = computePlan(doc(), TRIAL_START_MS);

    expect(info).toEqual({ plan: 'trial', trialDaysLeft: TRIAL_DURATION_DAYS });
  });

  it('counts down remaining days, rounding partial days up', () => {
    const info = computePlan(doc(), TRIAL_START_MS + 14.5 * DAY_MS);

    expect(info).toEqual({ plan: 'trial', trialDaysLeft: 1 });
  });

  it('drops to free exactly when the trial window closes', () => {
    const info = computePlan(doc(), TRIAL_START_MS + TRIAL_DURATION_DAYS * DAY_MS);

    expect(info).toEqual({ plan: 'free', trialDaysLeft: 0 });
  });

  it('is free before the service worker seeds the trial start', () => {
    const info = computePlan(createEmptyLicenseDocument(), TRIAL_START_MS);

    expect(info.plan).toBe('free');
  });

  it('a verified license grants pro even long after the trial ended', () => {
    const info = computePlan(verifiedDoc(true), TRIAL_START_MS + 100 * DAY_MS);

    expect(info).toEqual({ plan: 'pro', trialDaysLeft: 0 });
  });

  it('an invalidated license (refund) falls back to the trial/free rules', () => {
    expect(computePlan(verifiedDoc(false), TRIAL_START_MS).plan).toBe('trial');
    expect(computePlan(verifiedDoc(false), TRIAL_START_MS + 100 * DAY_MS).plan).toBe('free');
  });

  it('a stored key without a definitive verification does not grant pro', () => {
    const unverified = doc({ licenseKey: 'SOME-KEY', verification: null });

    expect(computePlan(unverified, TRIAL_START_MS + 100 * DAY_MS).plan).toBe('free');
  });
});

describe('gumroad verify response interpretation', () => {
  it('accepts a clean successful purchase', () => {
    const outcome = interpretVerifyResponse(200, { success: true, purchase: { refunded: false } });

    expect(outcome).toEqual({ valid: true });
  });

  it.each([
    ['refunded', { refunded: true }],
    ['chargebacked', { chargebacked: true }],
    ['subscription ended', { subscription_ended_at: '2026-01-01T00:00:00Z' }],
    ['subscription cancelled', { subscription_cancelled_at: '2026-01-01T00:00:00Z' }],
    ['subscription failed', { subscription_failed_at: '2026-01-01T00:00:00Z' }],
  ])('rejects a %s purchase with a reason', (_label, purchase) => {
    const outcome = interpretVerifyResponse(200, { success: true, purchase });

    expect(outcome?.valid).toBe(false);
    expect(outcome && !outcome.valid && outcome.reason.length > 0).toBe(true);
  });

  it('treats a 404 as a definitive invalid key, echoing the Gumroad message', () => {
    const outcome = interpretVerifyResponse(404, {
      success: false,
      message: 'That license does not exist for the provided product.',
    });

    expect(outcome).toEqual({
      valid: false,
      reason: 'That license does not exist for the provided product.',
    });
  });

  it('treats success:false as a definitive rejection', () => {
    const outcome = interpretVerifyResponse(200, { success: false, message: 'nope' });

    expect(outcome).toEqual({ valid: false, reason: 'nope' });
  });

  it.each([
    ['server error', 500, { success: true, purchase: {} }],
    ['unparseable body', 200, null],
    ['success without purchase payload', 200, { success: true }],
  ])('is indeterminate on %s (never changes the stored verdict)', (_label, status, body) => {
    expect(interpretVerifyResponse(status, body)).toBeNull();
  });
});

describe('free/pro tool split', () => {
  it('keeps exactly the basics free after the trial', () => {
    expect([...FREE_TOOL_IDS].sort()).toEqual(
      [TOOL_ID.fixBrokenImages, TOOL_ID.globalOutlines, TOOL_ID.gridOverlay].sort(),
    );
  });

  it('classifies every catalog tool on exactly one side', () => {
    for (const toolId of Object.values(TOOL_ID)) {
      expect(isProTool(toolId)).toBe(!FREE_TOOL_IDS.has(toolId));
    }
  });
});
