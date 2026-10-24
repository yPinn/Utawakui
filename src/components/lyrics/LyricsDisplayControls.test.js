import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (filename) =>
  readFileSync(new URL(filename, import.meta.url), 'utf8');
describe('shared display controls composition', () => {
  it('reuses shared field, segment, icon buttons and status primitives', () => {
    const source = read('./LyricsDisplayControls.vue');
    for (const name of [
      'LyricsSourceControl',
      'UiSelect',
      'UiSegmentedControl',
      'UiIconButton',
      'UiField',
      'UiButtonGroup',
      'UiHint',
      'UiNotice',
    ])
      expect(source).toContain(`<${name}`);
    expect(source).toContain('@reselect="selectReadingVariant"');
    expect(source).not.toContain('<select');
    expect(source).not.toMatch(
      /(?:#[a-f0-9]{3,8}\b|font-size:\s*\d|font-weight:\s*\d)/i,
    );
    expect(source).not.toContain('lyrics-display-controls__label');
    const tokens = read('../../styles/features/lyrics.css');
    for (const [family, tiers] of [
      ['font-size', ['lg', 'xl', '2xl']],
      ['romaji-font-size', ['md', 'lg', 'xl']],
      ['ruby-font-size', ['sm', 'sm', 'md']],
    ]) {
      ['compact', 'default', 'large'].forEach((size, index) => {
        expect(tokens).toContain(
          `--ui-lyrics-${family}-${size}: var(--ui-font-size-${tiers[index]});`,
        );
      });
    }
  });
  it('uses one display component and workflow in both contexts', () => {
    expect(read('./LyricsPreparationBar.vue')).toContain(
      '<LyricsDisplayControls',
    );
    for (const name of [
      'LyricsAuthoringWorkspace.vue',
      'PerformanceLyricsWorkspace.vue',
    ]) {
      const source = read(`./${name}`);
      expect(source).toContain('useLyricsDisplay');
      expect(source).not.toContain('generateReading(');
      expect(source).not.toContain('LYRICS_FONT_SIZE_CLASSES');
    }
  });
});
