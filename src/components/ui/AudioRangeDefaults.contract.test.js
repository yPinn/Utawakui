import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

describe('audio range context-menu reset contract', () => {
  it('keeps progress and live transport volume free of right-click reset defaults', () => {
    const playerBar = read('../playback/PlayerBar.vue');
    const bgmTransport = read('../bgm/BgmPlayerTransport.vue');

    const playerProgress = playerBar.match(
      /<UiRangeControl[\s\S]*?aria-label="播放進度"[\s\S]*?\/>/u,
    )?.[0];
    const playerVolume = playerBar
      .match(/<UiRangeControl[\s\S]*?aria-label="音量"[\s\S]*?\/>/gu)
      ?.at(-1);
    const bgmProgress = bgmTransport.match(
      /<UiRangeControl[\s\S]*?aria-label="BGM 進度"[\s\S]*?\/>/u,
    )?.[0];
    const bgmVolume = bgmTransport
      .match(/<UiRangeControl[\s\S]*?aria-label="BGM 音量"[\s\S]*?\/>/gu)
      ?.at(-1);

    for (const range of [
      playerProgress,
      playerVolume,
      bgmProgress,
      bgmVolume,
    ]) {
      expect(range).toBeTruthy();
      expect(range).not.toContain('default-value');
    }
  });

  it('keeps canonical reset values on calibration and pitch/tempo settings', () => {
    const playerBar = read('../playback/PlayerBar.vue');

    expect(playerBar).toContain(
      'defaultValue: PLAYER_AUDIO_DEFAULTS.monitorGuideVocalLevel',
    );
    expect(playerBar).toContain(
      'defaultValue: PLAYER_AUDIO_DEFAULTS.captureGuideVocalLevel',
    );
    expect(playerBar).toContain(
      'defaultValue: PLAYER_AUDIO_DEFAULTS.transposeSemitones',
    );
    expect(playerBar).toContain(
      'defaultValue: PLAYER_AUDIO_DEFAULTS.pitchCents',
    );
    expect(playerBar).toContain(
      'defaultValue: PLAYER_AUDIO_DEFAULTS.tempoRate',
    );
  });
});
