import { nextTick, reactive } from 'vue';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrackLyricsPreview from './TrackLyricsPreview.vue';
import AppRightDockSection from '../../layout/AppRightDockSection.vue';
import UiButton from '../../ui/UiButton.vue';
import UiSeparator from '../../ui/UiSeparator.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../../ui/uiTestHost.js';

const artworkTone = vi.hoisted(() => ({
  load: vi.fn(),
}));

vi.mock('../../../utils/artworkTone.js', () => ({
  loadArtworkTone: artworkTone.load,
}));

for (const [component, filename] of [
  [TrackLyricsPreview, './TrackLyricsPreview.vue'],
  [AppRightDockSection, '../../layout/AppRightDockSection.vue'],
  [UiButton, '../../ui/UiButton.vue'],
  [UiSeparator, '../../ui/UiSeparator.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const preview = {
  sourceLabel: "LRCLIB / NewJeans 'OMG'",
  lines: [
    { id: 'line-1', text: "이 모든 게 it's about you, baby", active: true },
    { id: 'line-2', text: 'Only you', active: false },
  ],
};

function mountPreview(overrides = {}) {
  return mount(TrackLyricsPreview, {
    preview,
    artworkUrl: '',
    ...overrides,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('TrackLyricsPreview', () => {
  beforeEach(() => {
    artworkTone.load.mockReset();
    artworkTone.load.mockResolvedValue(null);
  });

  it('keeps the compact playback preview focused on lyrics, not source evidence', () => {
    const { app, root } = mountPreview();
    const text = textContent(root);

    expect(text).toContain('歌詞預覽');
    expect(text).toContain("이 모든 게 it's about you, baby");
    expect(text).toContain('Only you');
    expect(text).toContain('開啟歌詞');
    expect(text).not.toContain("LRCLIB / NewJeans 'OMG'");
    app.unmount();
  });

  it('keeps its destination action in the section header with shared ghost weight', () => {
    const onOpen = vi.fn();
    const { app, root } = mountPreview({ onOpen });
    const header = findAll(root, (node) => node.type === 'header')[0];
    const openButton = findAll(
      header,
      (node) =>
        node.type === 'button' && textContent(node).includes('開啟歌詞'),
    )[0];

    expect(openButton).toBeTruthy();
    expect(String(openButton.props.class)).toContain('ui-btn--ghost');
    expect(String(openButton.props.class)).not.toContain('ui-btn--secondary');

    trigger(openButton, 'onClick');
    expect(onOpen).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('applies the current artwork tone to the whole contained block', async () => {
    artworkTone.load.mockResolvedValue('rgb(126 54 91)');
    const artworkUrl = 'utawakui-media://track/track-1/thumbnail.jpg';
    const { app, root } = mountPreview({ artworkUrl });

    await Promise.resolve();
    await nextTick();

    const section = findAll(root, (node) => node.type === 'section')[0];
    expect(artworkTone.load).toHaveBeenCalledWith(artworkUrl);
    expect(section.props.class).toContain('track-lyrics-preview--themed');
    expect(section.props.style).toMatchObject({
      '--track-lyrics-preview-tone': 'rgb(126 54 91)',
    });
    app.unmount();
  });

  it('keeps the semantic contained surface when artwork has no usable tone', async () => {
    const { app, root } = mountPreview({
      artworkUrl: 'utawakui-media://track/missing/thumbnail.jpg',
    });

    await Promise.resolve();
    await nextTick();

    const section = findAll(root, (node) => node.type === 'section')[0];
    expect(section.props.class).not.toContain('track-lyrics-preview--themed');
    expect(section.props.style).toEqual({});
    app.unmount();
  });

  it('ignores a stale artwork tone after the current track changes', async () => {
    const first = deferred();
    const second = deferred();
    artworkTone.load.mockImplementation((url) =>
      url.includes('track-1') ? first.promise : second.promise,
    );
    const props = reactive({
      preview,
      artworkUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
    });
    const { app, root } = mount(TrackLyricsPreview, props);

    props.artworkUrl = 'utawakui-media://track/track-2/thumbnail.jpg';
    await nextTick();
    second.resolve('rgb(28 96 142)');
    await Promise.resolve();
    await nextTick();
    first.resolve('rgb(126 54 91)');
    await Promise.resolve();
    await nextTick();

    const section = findAll(root, (node) => node.type === 'section')[0];
    expect(section.props.style).toMatchObject({
      '--track-lyrics-preview-tone': 'rgb(28 96 142)',
    });
    app.unmount();
  });

  it('caps artwork lightness and remaps local semantic foreground roles', () => {
    const source = readFileSync(
      new URL('./TrackLyricsPreview.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('min(l, 0.4)');
    expect(source).toContain(
      '--ui-color-text: var(--ui-color-overlay-contrast);',
    );
    expect(source).toContain('--ui-color-text-muted: color-mix(');
    expect(source).toContain(
      '--ui-color-focus: var(--ui-color-overlay-contrast);',
    );
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });

  it('keeps a truthful empty three-line viewport while lyrics are loading', () => {
    const { app, root } = mount(TrackLyricsPreview, {
      preview: null,
      loading: true,
    });
    const section = findAll(root, (node) => node.type === 'section')[0];
    const lines = findAll(root, (node) => node.type === 'p');

    expect(section.props['aria-busy']).toBe('true');
    expect(textContent(section)).toContain('歌詞預覽');
    expect(textContent(section)).toContain('開啟歌詞');
    expect(lines).toHaveLength(0);
    app.unmount();
  });

  it('shows at most three projected entries inside one shared viewport', () => {
    const { app, root } = mountPreview({
      preview: {
        lines: [
          { id: 'line-1', text: 'Current', active: true },
          { id: 'line-2', text: 'Next', active: false },
          { id: 'line-3', text: 'Faded', active: false },
          { id: 'line-4', text: 'Not rendered', active: false },
        ],
      },
    });
    const lines = findAll(root, (node) => node.type === 'p');

    expect(lines).toHaveLength(3);
    expect(textContent(root)).not.toContain('Not rendered');
    expect(String(lines[2].props.class)).not.toContain(
      'track-lyrics-preview__line--overflow',
    );
    app.unmount();
  });

  it('reserves three wrapping text lines without ellipsis and fades overflow at the viewport edge', () => {
    const source = readFileSync(
      new URL('./TrackLyricsPreview.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      '--track-lyrics-preview-viewport-block-size: calc(',
    );
    expect(source).toMatch(
      /\.track-lyrics-preview__lines\s*\{[^}]*min-block-size:\s*var\(--track-lyrics-preview-viewport-block-size\);[^}]*block-size:\s*var\(--track-lyrics-preview-viewport-block-size\);[^}]*max-block-size:\s*var\(--track-lyrics-preview-viewport-block-size\);[^}]*overflow:\s*hidden;[^}]*mask-image:\s*linear-gradient\(/su,
    );
    expect(source).toMatch(
      /\.track-lyrics-preview__line\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/su,
    );
    expect(source).toMatch(/var\(--ui-space-7\)\s*\+\s*var\(--ui-space-5\)/u);
    expect(source).not.toContain('grid-template-rows: repeat(3');
    expect(source).not.toContain('text-overflow: ellipsis');
    expect(source).not.toContain('white-space: nowrap');
    expect(source).not.toContain('track-lyrics-preview__line--overflow');
  });
});
