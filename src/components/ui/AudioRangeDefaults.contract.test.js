import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const read = (path) => readCatalogSource(new URL(path, import.meta.url));

describe('audio range context-menu reset contract', () => {
  it('keeps progress and live transport volume free of right-click reset defaults', () => {
    const playerBar = read('../playback/PlayerBar.vue');
    const bgmTransport = read('../bgm/BgmPlayerTransport.vue');

    const playerProgress = playerBar.match(
      /<UiRangeControl[\s\S]*?aria-label="播放進度"[\s\S]*?\/>/u,
    )?.[0];
    expect(playerBar).toMatch(/<UiVolumeControl[^>]*volume-label="音量"/u);
    const bgmProgress = bgmTransport.match(
      /<UiRangeControl[\s\S]*?aria-label="BGM 進度"[\s\S]*?\/>/u,
    )?.[0];
    expect(bgmTransport).toMatch(
      /<UiVolumeControl[^>]*volume-label="BGM 音量"/u,
    );
    const volume = read('./UiVolumeControl.vue').match(
      /<UiRangeControl[^>]*\/>/u,
    )?.[0];

    for (const range of [playerProgress, bgmProgress, volume]) {
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
