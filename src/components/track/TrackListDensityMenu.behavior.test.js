import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./TrackListDensityMenu.vue', import.meta.url),
  'utf8',
);

describe('TrackListDensityMenu', () => {
  it('uses shared disclosure and radio primitives for the two bounded recipes', () => {
    expect(source).toContain('<UiIconButton');
    expect(source).toContain('<UiPopover');
    expect(source).toContain('<UiRadioGroup');
    expect(source).toContain("id: 'list'");
    expect(source).toContain("label: '疏散'");
    expect(source).toContain("id: 'compact'");
    expect(source).toContain("label: '緊密'");
    expect(source).toContain("emit('updateDensity', value)");
  });

  it('keeps the popup to the two option labels without redundant copy', () => {
    expect(source).not.toContain('description:');
    expect(source).not.toContain('<template #header>');
    expect(source).toContain('legend="曲目顯示密度"');
    expect(source).toContain('legend-hidden');
  });

  it('does not introduce page-local color or geometry recipes', () => {
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
    expect(source).not.toContain('<style');
  });
});
