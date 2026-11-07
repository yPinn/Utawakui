import { describe, expect, it } from 'vitest';

import {
  projectBgmOperationalStatus,
  projectBgmPrimaryAction,
} from './bgmPresentation.js';

describe('shared BGM primary action', () => {
  it.each([
    'stopping-bgm',
    'track-preroll',
    'track-active',
    'postroll-silence',
  ])('locks artwork and transport during %s', (phase) => {
    expect(projectBgmPrimaryAction({ phase, hasTrack: true })).toMatchObject({
      intent: 'play',
      label: '播放場間音樂',
      disabled: true,
    });
  });
  it('allows manual play after performance pause, and pause even when current source disappears', () => {
    expect(
      projectBgmPrimaryAction({ phase: 'track-paused', hasTrack: true }),
    ).toMatchObject({ intent: 'play', disabled: false });
    expect(projectBgmPrimaryAction({ phase: 'bgm-playing' })).toMatchObject({
      intent: 'pause',
      label: '暫停場間音樂',
      disabled: false,
    });
    expect(projectBgmPrimaryAction()).toMatchObject({
      intent: 'play',
      disabled: true,
    });
  });
});

describe('BGM presentation projection', () => {
  it.each([
    ['idle', '場間音樂待命'],
    ['bgm-playing', '場間音樂播放中'],
    ['track-preroll', '曲前留白'],
    ['track-active', '演唱中'],
    ['track-paused', '演唱暫停'],
    ['postroll-silence', '曲後留白'],
    ['manual-hold', '場間音樂暫停'],
  ])('keeps %s visibly distinct as %s', (phase, label) => {
    expect(projectBgmOperationalStatus({ phase }).label).toBe(label);
  });

  it.each([false, true])(
    'hides fade feedback while retaining pending handoff (exceptions only: %s)',
    (exceptionsOnly) => {
      const fade = { phase: 'stopping-bgm', exceptionsOnly };
      expect(projectBgmOperationalStatus(fade)).toBeNull();
      expect(
        projectBgmOperationalStatus({ ...fade, restorePending: true }),
      ).toEqual({
        label: '曲後恢復',
        accessibleLabel: '曲後恢復場間音樂',
        tone: 'muted',
      });
    },
  );

  it('folds deferred restore into the operational sentence', () => {
    expect(
      projectBgmOperationalStatus({
        phase: 'track-active',
        restorePending: true,
      }),
    ).toMatchObject({
      label: '演唱中 · 曲後恢復',
      accessibleLabel: '演唱曲目播放中，曲後恢復場間音樂',
    });
  });

  it('shows the bounded public error instead of a generic failure badge', () => {
    expect(
      projectBgmOperationalStatus({
        phase: 'bgm-playing',
        error: '場間音樂音訊輸出暫時無法使用。',
      }),
    ).toMatchObject({
      label: '場間音樂音訊輸出暫時無法使用。',
      accessibleLabel: '場間音樂操作失敗：場間音樂音訊輸出暫時無法使用。',
      tone: 'danger',
    });
  });
});
