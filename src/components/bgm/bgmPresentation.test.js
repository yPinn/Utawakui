import { describe, expect, it } from 'vitest';

import { projectBgmOperationalStatus } from './bgmPresentation.js';

describe('BGM presentation projection', () => {
  it.each([
    ['idle', 'BGM 待命'],
    ['bgm-playing', 'BGM 播放中'],
    ['stopping-bgm', 'BGM 淡出中'],
    ['track-preroll', '曲前留白'],
    ['track-active', '演唱中'],
    ['track-paused', '演唱暫停'],
    ['postroll-silence', '曲後留白'],
    ['manual-hold', 'BGM 暫停'],
  ])('keeps %s visibly distinct as %s', (phase, label) => {
    expect(projectBgmOperationalStatus({ phase }).label).toBe(label);
  });

  it('folds deferred restore into the operational sentence', () => {
    expect(
      projectBgmOperationalStatus({
        phase: 'track-active',
        restorePending: true,
      }),
    ).toMatchObject({
      label: '演唱中 · 曲後回復',
      accessibleLabel: '演唱曲目播放中，曲後恢復 BGM',
    });
  });

  it('shows the bounded public error instead of a generic failure badge', () => {
    expect(
      projectBgmOperationalStatus({
        phase: 'bgm-playing',
        error: 'BGM 音訊輸出暫時無法使用。',
      }),
    ).toMatchObject({
      label: 'BGM 音訊輸出暫時無法使用。',
      accessibleLabel: 'BGM 操作失敗：BGM 音訊輸出暫時無法使用。',
      tone: 'danger',
    });
  });
});
