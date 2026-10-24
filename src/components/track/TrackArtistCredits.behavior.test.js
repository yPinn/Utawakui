import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const artistIndexState = { index: null };
const jumpToArtist = vi.fn();

vi.mock('../../composables/useArtistIndex.js', () => ({
  useArtistIndex: () => ({ state: artistIndexState }),
}));
vi.mock('../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({ jumpToArtist }),
}));

const { attachClientRender, findAll, mount, trigger } =
  await import('../ui/uiTestHost.js');
const { default: TrackArtistCredits } =
  await import('./TrackArtistCredits.vue');
const { default: UiTextButton } = await import('../ui/UiTextButton.vue');
const { default: UiOverflowTooltip } =
  await import('../ui/UiOverflowTooltip.vue');
const { default: UiTooltipSurface } =
  await import('../ui/tooltip/UiTooltipSurface.vue');

for (const [component, filename] of [
  [TrackArtistCredits, './TrackArtistCredits.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function render(props) {
  return renderToString(
    createSSRApp({ render: () => h(TrackArtistCredits, props) }),
  );
}

beforeEach(() => {
  artistIndexState.index = {
    artists: [
      { id: 'artist-yoasobi', name: 'YOASOBI', credits: [] },
      { id: 'artist-midories', name: 'ミドリーズ', credits: [] },
    ],
    trackArtistIds: {
      solo: ['artist-yoasobi'],
      duet: ['artist-yoasobi', 'artist-midories'],
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TrackArtistCredits', () => {
  it('keeps a read-only snapshot as plain text even when canonical credits resolve', async () => {
    const html = await render({
      track: { id: 'duet', artist: 'Snapshot singer' },
      navigable: false,
    });
    expect(html).toContain('Snapshot singer');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('YOASOBI');
  });
  it('links each credited artist with a named text action', async () => {
    const html = await render({
      track: { id: 'duet', artist: 'YOASOBI, ミドリーズ' },
    });
    expect(html).toContain('aria-label="前往藝人：YOASOBI"');
    expect(html).toContain('aria-label="前往藝人：ミドリーズ"');
    expect(html).toContain('track-artist-credits__separator');
  });

  it('announces navigation before opening the artist page', () => {
    const calls = [];
    jumpToArtist.mockImplementation((id) => calls.push(`jump:${id}`));
    const { app, root } = mount(TrackArtistCredits, {
      track: { id: 'solo', artist: 'YOASOBI' },
      onNavigate: (id) => calls.push(`navigate:${id}`),
    });
    const link = findAll(
      root,
      (node) => node.props['aria-label'] === '前往藝人：YOASOBI',
    )[0];

    trigger(link, 'onClick', { stopPropagation: () => {} });

    expect(calls).toEqual(['navigate:artist-yoasobi', 'jump:artist-yoasobi']);
    app.unmount();
  });

  it('retains separate navigation for later artists and isolates double clicks', () => {
    const calls = [];
    jumpToArtist.mockImplementation((id) => calls.push(`jump:${id}`));
    const { app, root } = mount(TrackArtistCredits, {
      track: { id: 'duet', artist: 'YOASOBI, ミドリーズ' },
      onNavigate: (id) => calls.push(`navigate:${id}`),
    });
    const link = findAll(
      root,
      (node) => node.props['aria-label'] === '前往藝人：ミドリーズ',
    )[0];
    const stopPropagation = vi.fn();
    trigger(link, 'onClick', { stopPropagation });
    trigger(link, 'onDblclick', { stopPropagation });
    expect(calls).toEqual(['navigate:artist-midories', 'jump:artist-midories']);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('reveals keyboard targets and restores the prefix on exit without moving pointer targets', async () => {
    const { app, root } = mount(TrackArtistCredits, {
      track: { id: 'duet', artist: 'YOASOBI, ミドリーズ' },
    });
    const line = findAll(root, (node) =>
      String(node.props.class).split(' ').includes('track-artist-credits'),
    )[0];
    const viewport = findAll(root, (node) =>
      String(node.props.class).includes('track-artist-credits__viewport'),
    )[0];
    const link = findAll(
      root,
      (node) => node.props['aria-label'] === '前往藝人：ミドリーズ',
    )[0];
    viewport.scrollLeft = 0;
    link.getBoundingClientRect = () => ({ left: 90 });
    link.matches = () => false;
    vi.stubGlobal('document', { activeElement: link });

    trigger(line, 'onFocusin', { target: link });
    await Promise.resolve();
    expect(viewport.scrollLeft).toBe(0);

    link.matches = () => true;
    trigger(line, 'onFocusin', { target: link });
    await Promise.resolve();
    expect(viewport.scrollLeft).toBe(90);

    trigger(line, 'onFocusout', { relatedTarget: null });
    expect(viewport.scrollLeft).toBe(0);
    app.unmount();
  });

  it('shows the same canonical name for every integrated credit', async () => {
    artistIndexState.index = {
      artists: [
        {
          id: 'artist-lin',
          name: '林俊傑',
          credits: [{ name: 'JJ Lin' }, { name: '林俊傑' }],
        },
      ],
      trackArtistIds: {
        english: ['artist-lin'],
        chinese: ['artist-lin'],
      },
    };

    const english = await render({
      track: { id: 'english', artist: 'JJ Lin' },
    });
    const chinese = await render({
      track: { id: 'chinese', artist: '林俊傑' },
    });

    expect(english).toContain('前往藝人：林俊傑');
    expect(english).not.toContain('>JJ Lin<');
    expect(chinese).toContain('前往藝人：林俊傑');
  });

  it('renders nothing for a track without artist text', async () => {
    const html = await render({ track: { id: 'solo', artist: '' } });
    expect(html).not.toContain('track-artist-credits');
  });

  it('falls back to the plain credit before the index loads or when parts cannot pair', async () => {
    artistIndexState.index = null;
    const loading = await render({ track: { id: 'solo', artist: 'YOASOBI' } });
    expect(loading).not.toContain('ui-text-btn');
    expect(loading).toContain('YOASOBI');

    artistIndexState.index = {
      artists: [],
      trackArtistIds: { duet: ['artist-yoasobi', 'artist-midories'] },
    };
    const unpaired = await render({
      track: { id: 'duet', artist: 'YOASOBI & ミドリーズ' },
    });
    expect(unpaired).not.toContain('ui-text-btn');
    expect(unpaired).toContain('YOASOBI &amp; ミドリーズ');
  });
});
