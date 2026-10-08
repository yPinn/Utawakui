import { h } from 'vue';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import TrackContextHero from './TrackContextHero.vue';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [TrackContextHero, './TrackContextHero.vue'],
  [UiArtworkOverlay, '../ui/UiArtworkOverlay.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const track = {
  id: 'track-1',
  title: '很長但仍然清楚的目前播放歌曲名稱',
  artist: '真實演出者',
  thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
};

describe('TrackContextHero', () => {
  it('renders one artwork-led identity with an explicit source destination', () => {
    const onNavigateSource = vi.fn();
    const { app, root } = mount(
      TrackContextHero,
      {
        track,
        sourceName: '深夜練唱清單',
        sourceLinkLabel: '前往播放清單：深夜練唱清單',
        sourceNavigable: true,
        onNavigateSource,
      },
      {
        actions: () => h('button', { type: 'button' }, '歌曲選項'),
      },
    );
    const sourceLink = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '深夜練唱清單',
    )[0];
    const artwork = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-track-thumb'),
    )[0];

    expect(textContent(root)).toContain(track.title);
    expect(textContent(root)).toContain(track.artist);
    expect(textContent(root)).toContain('歌曲選項');
    expect(sourceLink.props['aria-label']).toBe('前往播放清單：深夜練唱清單');
    expect(artwork.props.style).toMatchObject({
      width: '100%',
      height: '100%',
    });

    trigger(sourceLink, 'onClick', { stopPropagation: vi.fn() });
    expect(onNavigateSource).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps an unknown queue source truthful and non-interactive', () => {
    const onNavigateSource = vi.fn();
    const { app, root } = mount(TrackContextHero, {
      track: { id: 'track-2', title: '準備播放', artist: '' },
      sourceName: '目前佇列',
      sourceNavigable: false,
      onNavigateSource,
    });
    const sourceLinks = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '目前佇列',
    );

    expect(textContent(root)).toContain('目前佇列');
    expect(textContent(root)).toContain('未知演唱者');
    expect(sourceLinks).toHaveLength(0);
    expect(onNavigateSource).not.toHaveBeenCalled();
    app.unmount();
  });

  it('uses the established overlay, type, radius, and spacing tokens', () => {
    const source = readFileSync(
      new URL('./TrackContextHero.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('var(--ui-radius-lg)');
    expect(source).toContain('var(--ui-color-overlay-scrim)');
    expect(source).toContain('var(--ui-color-overlay-scrim-active)');
    expect(source).toContain('var(--ui-color-overlay-contrast)');
    expect(source).toContain('var(--ui-font-size-lg)');
    expect(source).toContain('var(--ui-font-size-sm)');
    expect(source).toContain('var(--ui-space-4)');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(source).not.toMatch(/margin-(?:top|bottom):/u);
  });
});
