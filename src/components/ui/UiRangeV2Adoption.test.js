import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_DEMO_ADOPTED_SECTION_KEYS } from '../../constants/uiDemoSections.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const controlPath = new URL('./range/UiRangeControl.vue', import.meta.url);
const rangeSource = read('./UiRange.vue');
const playerBarSource = read('../playback/PlayerBar.vue');
const playerToolsSource = read('../playback/PlayerToolsPanel.vue');
const obsAppearanceSource = read('../output/ObsAppearanceField.vue');
const demoSource = read('../demo/DemoRangeAppearance.vue');
const playerOwnerSource = read('../../composables/usePlayer.js');
const tokensSource = read('../../styles/tokens.css');

describe('Token v2 Range formal adoption', () => {
  it('promotes one formal control primitive and removes the parallel Candidate implementation', () => {
    expect(existsSync(controlPath)).toBe(true);
    expect(
      existsSync(new URL('../demo/DemoCandidateRange.vue', import.meta.url)),
    ).toBe(false);
    expect(rangeSource).toContain(
      "import UiRangeControl from './range/UiRangeControl.vue';",
    );
    expect(demoSource).not.toContain('DemoCandidateRange');
    expect(UI_DEMO_ADOPTED_SECTION_KEYS).toContain('range');
  });

  it('keeps the adopted authored appearance aliases in the production graph', () => {
    for (const token of [
      '--ui-range-track:',
      '--ui-range-fill:',
      '--ui-range-fill-hover:',
      '--ui-range-fill-active:',
      '--ui-range-thumb:',
      '--ui-range-thumb-border:',
      '--ui-range-focus:',
      '--ui-range-invalid:',
      '--ui-range-stop:',
      '--ui-range-value:',
    ]) {
      expect(tokensSource, token).toContain(token);
    }
  });

  it('migrates every production slider authoring site to the formal primitive', () => {
    for (const source of [
      playerBarSource,
      playerToolsSource,
      obsAppearanceSource,
    ]) {
      expect(source).toContain('UiRangeControl');
      expect(source).not.toContain('type="range"');
    }
  });

  it('keeps time and numeric formatting with the consumer that owns the domain', () => {
    expect(playerBarSource).toContain(':format-value="formatDuration"');
    expect(playerBarSource).toContain(':format-value="formatVolumePercent"');
    expect(playerToolsSource).toContain(
      ':format-value="row.formatSliderValue"',
    );
    expect(obsAppearanceSource).toContain(':format-value="formatRangeValue"');
  });

  it('opts canonical performance adjustments into reset without changing transport sliders', () => {
    expect(
      playerToolsSource.match(/:default-value="row\.defaultValue"/gu),
    ).toHaveLength(2);
    expect(playerOwnerSource).toMatch(
      /export\s*\{[^}]*PLAYER_AUDIO_DEFAULTS[^}]*\}/su,
    );

    for (const mapping of [
      'defaultValue: PLAYER_AUDIO_DEFAULTS.monitorGuideVocalLevel',
      'defaultValue: PLAYER_AUDIO_DEFAULTS.captureGuideVocalLevel',
      'defaultValue: PLAYER_AUDIO_DEFAULTS.transposeSemitones',
      'defaultValue: PLAYER_AUDIO_DEFAULTS.pitchCents',
      'defaultValue: PLAYER_AUDIO_DEFAULTS.tempoRate',
    ]) {
      expect(playerBarSource).toContain(mapping);
    }

    expect(playerBarSource.match(/defaultValue:/gu)).toHaveLength(5);
    expect(playerBarSource).not.toMatch(
      /player-bar__(?:progress|volume)-range[\s\S]{0,240}:default-value=/u,
    );
  });

  it('limits the custom track and interaction thumb to the v2 component scope', () => {
    const controlSource = read('./range/UiRangeControl.vue');

    expect(controlSource).toContain("@scope ([data-ui-system='v2'])");
    expect(controlSource).toContain('.ui-range-control {');
    expect(controlSource).toContain('appearance: none;');
    expect(controlSource).toMatch(
      /::-webkit-slider-thumb\s*\{[\s\S]*?opacity:\s*0;/u,
    );
    expect(controlSource).toMatch(
      /:hover:not\(\s*:disabled\s*\)::-webkit-slider-thumb[\s\S]*?:focus-visible::-webkit-slider-thumb[\s\S]*?:active:not\(\s*:disabled\s*\)::-webkit-slider-thumb[\s\S]*?opacity:\s*1;/u,
    );
    expect(controlSource).toContain('@media (forced-colors: active)');
    expect(controlSource).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
