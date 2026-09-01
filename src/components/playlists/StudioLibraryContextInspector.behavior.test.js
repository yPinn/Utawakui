import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import StudioLibraryContextInspector from './StudioLibraryContextInspector.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [StudioLibraryContextInspector, './StudioLibraryContextInspector.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const facts = [
  { id: 'track-count', label: '曲目', value: '12 首' },
  { id: 'duration', label: '總長', value: '48 分' },
  { id: 'formats', label: '格式', value: 'FLAC · WAV' },
];

function mountInspector(open) {
  const onToggle = vi.fn();
  const mounted = mount(StudioLibraryContextInspector, {
    open,
    collectionTitle: '真實專輯',
    facts,
    coverUrl: 'utawakui-media://playlist-cover/album-1/cover.jpg',
    tracks: [
      {
        id: 'track-1',
        title: '目前播放的歌曲',
        thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
      },
    ],
    canCollage: false,
    currentTrackTitle: '目前播放的歌曲',
    onToggle,
  });
  return { ...mounted, onToggle };
}

describe('Studio Library Context Inspector', () => {
  it('keeps collapsed content hidden even when component layout styles are loaded', () => {
    const source = readFileSync(
      new URL('./StudioLibraryContextInspector.vue', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /\.studio-context-inspector__content\[hidden\]\s*{\s*display:\s*none;/,
    );
  });

  it('shows collection facts in an independently labelled expanded panel', () => {
    const { app, root, onToggle } = mountInspector(true);
    const aside = findAll(root, (node) => node.type === 'aside')[0];
    const collapse = findAll(
      root,
      (node) => node.props['aria-label'] === '摺疊集合資料',
    )[0];
    const artwork = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__artwork',
      ),
    )[0];
    const renderedArtwork = findAll(
      root,
      (node) =>
        node.type === 'span' &&
        String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];
    const currentStatus = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-status-icon'),
    )[0];

    expect(aside.props['aria-label']).toBe('集合資料');
    expect(textContent(root)).toContain('真實專輯');
    expect(textContent(root)).toContain('FLAC · WAV');
    expect(textContent(root)).toContain('目前播放的歌曲');
    expect(artwork).toBeTruthy();
    expect(renderedArtwork.props.style).toMatchObject({
      width: '280px',
      height: '280px',
    });
    expect(String(collapse.props.class)).toContain('ui-icon-btn');
    expect(String(collapse.props.class)).toContain(
      'studio-context-inspector__collapse',
    );
    expect(currentStatus.props['aria-hidden']).toBe('true');
    expect(currentStatus.props['aria-label']).toBeUndefined();
    expect(collapse.props['aria-expanded']).toBe(true);
    trigger(collapse, 'onClick');
    expect(onToggle).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('turns the entire collapsed rail into one explicit expand control', () => {
    const { app, root, onToggle } = mountInspector(false);
    const aside = findAll(root, (node) => node.type === 'aside')[0];
    const content = findAll(
      root,
      (node) => node.props.id === 'studio-library-inspector-content',
    )[0];
    const expand = findAll(
      root,
      (node) => node.props['aria-label'] === '展開集合資料',
    )[0];

    expect(aside.props['aria-label']).toBe('集合資料（已摺疊）');
    expect(content.props.hidden).toBe(true);
    expect(content.props['aria-hidden']).toBe(true);
    expect(expand.props['aria-expanded']).toBe(false);
    expect(String(expand.props.class)).toContain('ui-icon-btn');
    expect(String(expand.props.class)).toContain('ui-icon-btn--stretch');
    trigger(expand, 'onClick');
    expect(onToggle).toHaveBeenCalledOnce();
    app.unmount();
  });
});
