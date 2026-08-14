import { describe, expect, it } from 'vitest';
import {
  FEATURE_IDS,
  buildFeatureConfirmation,
  getFeatureGate,
  isFeatureGateEnabled,
  normalizeFeatureConfirmations,
} from './featureGates.js';

describe('featureGates', () => {
  it('builds a provider-flow confirmation record with the current notice version', () => {
    expect(
      buildFeatureConfirmation(FEATURE_IDS.PROVIDER_FLOW, {
        now: () => new Date('2026-08-13T00:00:00.000Z'),
      }),
    ).toEqual({
      featureId: 'provider-flow',
      noticeVersion: 'feature-notice-v1',
      confirmedAt: '2026-08-13T00:00:00.000Z',
      enabled: true,
    });
  });

  it('rejects unknown feature ids', () => {
    expect(getFeatureGate('missing-flow')).toBe(null);
    expect(() => buildFeatureConfirmation('missing-flow')).toThrow(
      'unknown feature gate: missing-flow',
    );
  });

  it('normalizes only enabled records whose notice version is current', () => {
    expect(
      normalizeFeatureConfirmations({
        'provider-flow': {
          noticeVersion: 'feature-notice-v1',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
        'lyrics-flow': {
          noticeVersion: 'old-notice',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
        'audio-processing-flow': {
          noticeVersion: 'feature-notice-v1',
          confirmedAt: 'not-a-date',
          enabled: true,
        },
        'public-output-flow': {
          noticeVersion: 'feature-notice-v1',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: false,
        },
      }),
    ).toEqual({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'feature-notice-v1',
        confirmedAt: '2026-08-13T00:00:00.000Z',
        enabled: true,
      },
    });
  });

  it('checks a config object for an enabled current confirmation', () => {
    const config = {
      featureConfirmations: {
        'provider-flow': {
          featureId: 'provider-flow',
          noticeVersion: 'feature-notice-v1',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
      },
    };

    expect(isFeatureGateEnabled(config, FEATURE_IDS.PROVIDER_FLOW)).toBe(true);
    expect(isFeatureGateEnabled(config, FEATURE_IDS.LYRICS_FLOW)).toBe(false);
  });
});
