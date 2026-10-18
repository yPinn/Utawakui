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
      noticeVersion: 'provider-flow-notice-v5',
      confirmedAt: '2026-08-13T00:00:00.000Z',
      enabled: true,
    });
  });

  it('rejects unknown feature ids', () => {
    expect(getFeatureGate('missing-flow')).toBe(null);
    expect(getFeatureGate('__proto__')).toBe(null);
    expect(() => buildFeatureConfirmation('missing-flow')).toThrow(
      'unknown feature gate: missing-flow',
    );
    expect(() => buildFeatureConfirmation('__proto__')).toThrow(
      'unknown feature gate: __proto__',
    );
  });

  it('normalizes only enabled records whose notice version is current', () => {
    expect(
      normalizeFeatureConfirmations({
        'provider-flow': {
          noticeVersion: 'provider-flow-notice-v5',
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
        noticeVersion: 'provider-flow-notice-v5',
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
          noticeVersion: 'provider-flow-notice-v5',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
      },
    };

    expect(isFeatureGateEnabled(config, FEATURE_IDS.PROVIDER_FLOW)).toBe(true);
    expect(isFeatureGateEnabled(config, FEATURE_IDS.LYRICS_FLOW)).toBe(false);
  });

  it('requires renewed disclosure for external queries while preserving unrelated confirmations', () => {
    const confirmations = Object.fromEntries(
      Object.keys(FEATURE_GATES).map((id) => [
        id,
        buildFeatureConfirmation(id),
      ]),
    );
    confirmations[FEATURE_IDS.PROVIDER_FLOW].noticeVersion =
      'provider-flow-notice-v4';
    confirmations[FEATURE_IDS.LYRICS_FLOW].noticeVersion = 'feature-notice-v3';

    expect(Object.keys(normalizeFeatureConfirmations(confirmations))).toEqual([
      FEATURE_IDS.AUDIO_PROCESSING_FLOW,
      FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
      FEATURE_IDS.OBS_INTEGRATION,
    ]);
  });

  it('keeps user copy bounded, source-specific and free of internal implementation details', () => {
    const gates = Object.values(FEATURE_GATES);
    expect(gates).toHaveLength(5);
    for (const gate of gates) {
      expect(gate.cancelLabel).toBe('取消');
      expect(gate.summary.length).toBeLessThanOrEqual(28);
      expect(gate.summary.endsWith('。')).toBe(true);
      expect(gate.body.length).toBeGreaterThanOrEqual(3);
      expect(gate.body.length).toBeLessThanOrEqual(4);
      expect(gate.bodyTitles).toHaveLength(gate.body.length);
      expect(gate.body.every((line) => line.endsWith('。'))).toBe(true);
      expect(gate.body.every((line) => line.length <= 100)).toBe(true);
      expect(gate.body.join('')).toContain('啟用設定');
      expect(gate.body.join('')).toContain('本機');
      expect([gate.summary, ...gate.body].join('')).not.toMatch(
        /FFmpeg|GPLv[0-9]|BPM|yt-dlp|Python|MDX|127\.0\.0\.1|https?:\/\//u,
      );
      if (gate.id !== FEATURE_IDS.OBS_INTEGRATION) {
        expect(gate.body.join('')).toContain('適用法律');
        expect(gate.body.join('')).toContain('授權');
      }
    }
    const provider = getFeatureGate(FEATURE_IDS.PROVIDER_FLOW);
    const lyrics = getFeatureGate(FEATURE_IDS.LYRICS_FLOW);
    const audio = getFeatureGate(FEATURE_IDS.AUDIO_PROCESSING_FLOW);
    const output = getFeatureGate(FEATURE_IDS.PUBLIC_OUTPUT_FLOW);
    const obs = getFeatureGate(FEATURE_IDS.OBS_INTEGRATION);
    expect(provider.noticeVersion).toBe('provider-flow-notice-v5');
    expect(lyrics.noticeVersion).toBe('lyrics-flow-notice-v4');
    expect([audio, output, obs].map((gate) => gate.noticeVersion)).toEqual([
      'feature-notice-v3',
      'feature-notice-v3',
      'feature-notice-v3',
    ]);
    expect(provider.body.join('')).toContain('藝人名稱傳送至 MusicBrainz');
    expect(provider.body.join('')).toContain('載入或更新曲庫時');
    expect(provider.body.join('')).toContain('條款與存取限制');
    expect(lyrics.body.join('')).toContain('歌名、藝人名稱等曲目資訊傳送');
    expect(lyrics.body.join('')).toContain('公開顯示');
    expect(audio.summary).toContain('轉換格式');
    expect(audio.summary).not.toMatch(/音高|速度/u);
    expect(audio.body.join('')).toContain('不會為此上傳歌曲');
    expect(audio.body.join('')).toContain('需要下載');
    expect(output.body.join('')).toContain('當你將其加入直播或錄影時');
    expect(output.body.join('')).toContain('平台未限制或允許營利');
    expect(obs.body.join('')).toContain('不會替你開始或停止直播、錄影');
    expect(obs.body.join('')).toContain('密碼會加密保存在本機');
    expect(obs.body.join('')).toContain('匯出或分享記錄前');
    expect(obs.body.join('')).not.toContain('不會驗證素材授權');
  });
});
