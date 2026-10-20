import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sources = [
  'BgmPlayer',
  'BgmPlayerTransport',
  'BgmCurrentSource',
  'BgmTrackPicker',
].map((n) => read('./' + n + '.vue'));
describe('integrated BGM layout contract', () => {
  it('uses shared spacing and color tokens with no floating wrapper or fixed page dimensions', () => {
    for (const source of sources) {
      const css = source.split('<style scoped>')[1];
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
      for (const match of css.matchAll(
        /(?:^|\s)(?:padding(?:-[\w-]+)?|margin(?:-[\w-]+)?|gap):\s*([^;]+);/gmu,
      ))
        expect(match[1]).not.toMatch(/\b\d*\.?\d+(?:px|rem)\b/iu);
    }
    expect(sources[0]).not.toContain('position: absolute');
    expect(sources[0]).not.toContain('UiSurface');
  });
  it('lets the picker own its result scroll and reflows controls from the workspace container', () => {
    expect(sources[3]).toContain('<UiScrollLayout');
    expect(sources[0]).not.toContain('UiScrollRegion');
    expect(sources[0]).toContain('@container performance-session-workspace');
    expect(sources[1]).toContain('<UiPopover');
    expect(sources[1]).toContain('音量與進度');
    expect(sources[1]).toContain('立即停止 BGM');
  });
});
