import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';
const read = (p) => readCatalogSource(new URL(p, import.meta.url));
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
    expect(sources[0]).toContain('<UiPopover');
    expect(sources[1]).not.toContain('<UiPopover');
    expect(sources[1]).toContain('bgm-transport__context');
    expect(sources[1]).toContain('場間音樂進度');
    expect(sources[1]).toContain('場間音樂音量');
    expect(sources[1]).toContain('立即停止場間音樂');
  });
  it('uses the shared folder tool geometry for the resting tabs and raised picker', () => {
    const [player] = sources;
    expect(player).toMatch(
      /\.bgm-player__tab-button\s*\{[^}]*min-inline-size:\s*var\(--ui-folder-tool-tab-length\);[^}]*block-size:\s*var\(--ui-folder-tool-tab-depth\);/su,
    );
    expect(player).toMatch(
      /\.bgm-player__audio-tab--paired\s*\{[^}]*margin-inline-end:\s*calc\(\s*var\(--ui-folder-tool-tab-length\) \+ var\(--ui-folder-tool-tab-gap\)/su,
    );
    expect(player).toMatch(
      /\.ui-popover__header\)\s*\{[^}]*gap:\s*var\(--ui-folder-tool-tab-gap\);[^}]*padding:\s*0 var\(--ui-right-dock-content-inset\);/su,
    );
    expect(player).toMatch(
      /\.ui-popover__scroll\)\s*\{[^}]*border-block-start:\s*var\(--ui-folder-tool-tab-seam-width\) solid\s*var\(--ui-color-folder-primary\)/su,
    );
  });
});
