import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const read = (path) => readCatalogSource(new URL(path, import.meta.url));

describe('audio range context-menu reset contract', () => {
  it('keeps progress and live transport volume free of right-click reset defaults', () => {
    const playerBar = read('../playback/PlayerBar.vue');
    const bgmTransport = readFileSync(
      new URL('../bgm/BgmPlayerTransport.vue', import.meta.url),
      'utf8',
    );

    const playerProgress = playerBar.match(
      /<UiRangeControl[\s\S]*?aria-label="播放進度"[\s\S]*?\/>/u,
    )?.[0];
    const playerVolume = playerBar.match(
      /<UiVolumeControl[^>]*volume-label="音量"[^>]*\/>/u,
    )?.[0];
    const bgmProgress = bgmTransport.match(
      /<UiRangeControl[\s\S]*?class="bgm-transport__progress-range"[\s\S]*?\/>/u,
    )?.[0];
    const bgmVolume = bgmTransport.match(
      /<UiVolumeControl[^>]*:volume-label="t\('player\.bgm\.volume'\)"[^>]*\/>/u,
    )?.[0];

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
