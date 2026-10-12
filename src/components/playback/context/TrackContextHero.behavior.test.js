import { readFileSync } from 'node:fs';
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UiArtworkOverlay from '../../ui/UiArtworkOverlay.vue';
import UiIconButton from '../../ui/UiIconButton.vue';
import UiMarqueeText from '../../ui/UiMarqueeText.vue';
import UiTextButton from '../../ui/UiTextButton.vue';
import UiOverflowTooltip from '../../ui/UiOverflowTooltip.vue';
import UiTrackThumb from '../../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../../ui/tooltip/UiTooltipSurface.vue';
import TrackArtistCredits from '../../track/TrackArtistCredits.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../../ui/uiTestHost.js';

const navigation = vi.hoisted(() => ({
  albums: new Map(),
  jumpToAlbum: vi.fn(),
  jumpToArtist: vi.fn(),
}));
const artistIndexState = vi.hoisted(() => ({ index: null }));

vi.mock('../../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({
    albumForTrack: (candidate) => navigation.albums.get(candidate?.id) ?? null,
    jumpToAlbum: navigation.jumpToAlbum,
    jumpToArtist: navigation.jumpToArtist,
  }),
}));
vi.mock('../../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({ state: artistIndexState }),
}));

const { default: TrackContextHero } = await import('./TrackContextHero.vue');

for (const [component, filename] of [
  [TrackContextHero, './TrackContextHero.vue'],
  [UiArtworkOverlay, '../../ui/UiArtworkOverlay.vue'],
  [UiIconButton, '../../ui/UiIconButton.vue'],
  [UiMarqueeText, '../../ui/UiMarqueeText.vue'],
  [UiTextButton, '../../ui/UiTextButton.vue'],
  [UiOverflowTooltip, '../../ui/UiOverflowTooltip.vue'],
  [UiTrackThumb, '../../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../../ui/tooltip/UiTooltipSurface.vue'],
  [TrackArtistCredits, '../../track/TrackArtistCredits.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const track = {
  id: 'track-1',
  title: '很長但仍然清楚的目前播放歌曲名稱',
  artist: '真實演出者',
  thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
};

beforeEach(() => {
  navigation.albums = new Map([
    [track.id, { id: 'album-1', name: '來源專輯' }],
  ]);
  navigation.jumpToAlbum.mockReset();
  navigation.jumpToArtist.mockReset();
  artistIndexState.index = {
    artists: [{ id: 'artist-1', name: track.artist, credits: [] }],
    trackArtistIds: { [track.id]: ['artist-1'] },
  };
});

describe('TrackContextHero', () => {
  it('keeps artwork focused on track identity instead of repeating the source destination', () => {
    const { app, root } = mount(
      TrackContextHero,
      {
        track,
      },
      {
        actions: () => h('button', { type: 'button' }, '歌曲選項'),
      },
    );
    const artwork = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-track-thumb'),
    )[0];

    expect(textContent(root)).toContain(track.title);
    expect(textContent(root)).toContain(track.artist);
    expect(textContent(root)).toContain('歌曲選項');
    expect(textContent(root)).not.toContain('深夜練唱清單');
    expect(artwork.props.style).toMatchObject({
      width: '100%',
      height: '100%',
    });
    app.unmount();
  });

  it('links verified album and artist destinations without emitting Dock close intent', () => {
    const calls = [];
    navigation.jumpToAlbum.mockImplementation(() => calls.push('album'));
    navigation.jumpToArtist.mockImplementation(() => calls.push('artist'));
    const { app, root } = mount(TrackContextHero, {
      track,
    });
    const albumCta = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        node.props['aria-label'] === `${track.title}，前往專輯：來源專輯`,
    )[0];
    const artistCta = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        node.props['aria-label'] === `前往藝人：${track.artist}`,
    )[0];

    expect(albumCta).toBeTruthy();
    expect(artistCta).toBeTruthy();
    trigger(albumCta, 'onClick', { stopPropagation: vi.fn() });
    trigger(artistCta, 'onClick', { stopPropagation: vi.fn() });
    expect(calls).toEqual(['album', 'artist']);
    app.unmount();
  });

  it('uses the canonical artist name for visible and accessible identity', () => {
    artistIndexState.index = {
      artists: [{ id: 'artist-lin', name: '林俊傑', credits: [] }],
      trackArtistIds: { english: ['artist-lin'] },
    };
    const { app, root } = mount(TrackContextHero, {
      track: { id: 'english', title: '53 Dawns', artist: 'JJ Lin' },
    });
    const hero = findAll(root, (node) => node.type === 'article')[0];

    expect(textContent(root)).toContain('林俊傑');
    expect(textContent(root)).not.toContain('JJ Lin');
    expect(hero.props['aria-label']).toBe('目前歌曲：53 Dawns，林俊傑');
    app.unmount();
  });

  it('keeps unresolved destinations as plain identity text', () => {
    const source = readFileSync(
      new URL('./TrackContextHero.vue', import.meta.url),
      'utf8',
    );
    navigation.albums.clear();
    artistIndexState.index = { artists: [], trackArtistIds: {} };
    const { app, root } = mount(TrackContextHero, {
      track: { id: 'track-2', title: '準備播放', artist: '' },
    });
    const links = findAll(root, (node) => node.type === 'button');

    expect(textContent(root)).toContain('未知演唱者');
    expect(links).toHaveLength(0);
    expect(source).not.toContain('sourceName');
    expect(source).not.toContain('sourceNavigable');
    expect(source).not.toContain('navigateSource');
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
