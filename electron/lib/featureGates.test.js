import { describe, expect, it } from 'vitest';
import {
  FEATURE_GATES,
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
      noticeVersion: 'feature-notice-v3',
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
          noticeVersion: 'feature-notice-v3',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
        'lyrics-flow': {
          noticeVersion: 'feature-notice-v2',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
        'audio-processing-flow': {
          noticeVersion: 'feature-notice-v3',
          confirmedAt: 'not-a-date',
          enabled: true,
        },
        'public-output-flow': {
          noticeVersion: 'feature-notice-v3',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: false,
        },
      }),
    ).toEqual({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'feature-notice-v3',
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
          noticeVersion: 'feature-notice-v3',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
      },
    };

    expect(isFeatureGateEnabled(config, FEATURE_IDS.PROVIDER_FLOW)).toBe(true);
    expect(isFeatureGateEnabled(config, FEATURE_IDS.LYRICS_FLOW)).toBe(false);
  });

  it('keeps declaration copy concise and consistent across every gate', () => {
    const gates = Object.values(FEATURE_GATES);

    expect(gates).toHaveLength(4);
    for (const gate of gates) {
      expect(gate.noticeVersion).toBe('feature-notice-v3');
      expect(gate.cancelLabel).toBe('取消');
      expect(gate.summary.length).toBeLessThanOrEqual(40);
      expect(gate.summary.endsWith('。')).toBe(true);
      expect(gate.body.length).toBeGreaterThanOrEqual(3);
      expect(gate.body.length).toBeLessThanOrEqual(4);
      expect(gate.body.every((line) => line.endsWith('。'))).toBe(true);
      expect(gate.body.at(-1)).toBe(
        'Utawakui 不會驗證素材授權；啟用紀錄僅保存在本機。',
      );
    }

    expect(getFeatureGate(FEATURE_IDS.PROVIDER_FLOW).body.join('')).toContain(
      '來源平台',
    );
    expect(getFeatureGate(FEATURE_IDS.LYRICS_FLOW).body.join('')).toContain(
      '公開顯示',
    );
    expect(
      getFeatureGate(FEATURE_IDS.AUDIO_PROCESSING_FLOW).body.join(''),
    ).toContain('FFmpeg（GPLv3）');
    expect(
      getFeatureGate(FEATURE_IDS.PUBLIC_OUTPUT_FLOW).body.join(''),
    ).toContain('直播、錄影或 VOD');
  });
});
