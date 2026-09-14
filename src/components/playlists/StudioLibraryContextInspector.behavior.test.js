import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import StudioLibraryContextInspector from './StudioLibraryContextInspector.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
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
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const currentTrack = {
  id: 'track-1',
  title: '目前播放的歌曲',
  artist: '真實演出者',
  album: '來源專輯',
  duration: 252,
  filename: '01-current.flac',
  thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
};

const upcomingTracks = [
  {
    id: 'track-2',
    title: '下一首歌曲',
    artist: '演出者二',
    duration: 181,
    filename: '02-next.wav',
  },
  {
    id: 'track-3',
    title: 'その次の曲',
    artist: '演出者三',
    duration: 239,
    filename: '03-after.webm',
  },
];

function mountInspector(open) {
  const onToggle = vi.fn();
  const mounted = mount(StudioLibraryContextInspector, {
    open,
    currentTrack,
    queueSourceName: '深夜練唱清單',
    upcomingTracks,
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

  it('shows current-track metadata from the playback context without repeating playlist facts', () => {
    const { app, root, onToggle } = mountInspector(true);
    const aside = findAll(root, (node) => node.type === 'aside')[0];
    const collapse = findAll(
      root,
      (node) => node.props['aria-label'] === '摺疊播放資訊',
    )[0];
    const artwork = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'studio-context-inspector__current-artwork',
      ),
    )[0];
    const renderedArtwork = findAll(
      root,
      (node) =>
        node.type === 'span' &&
        String(node.props?.class ?? '').includes('ui-track-thumb'),
    )[0];
    const currentStatus = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-status-icon'),
    )[0];

    expect(aside.props['aria-label']).toBe('播放資訊');
    expect(textContent(root)).toContain('深夜練唱清單');
    expect(textContent(root)).toContain('目前播放的歌曲');
    expect(textContent(root)).toContain('真實演出者');
    expect(textContent(root)).toContain('來源專輯');
    expect(textContent(root)).toContain('4:12');
    expect(textContent(root)).toContain('本機 FLAC');
    expect(textContent(root)).not.toMatch(
      /檔案摘要|曲目\s*12 首|總長|集合類型/u,
    );
    expect(artwork).toBeTruthy();
    expect(renderedArtwork.props.style).toMatchObject({
      width: 'var(--ui-track-artwork-size-preview)',
      height: 'var(--ui-track-artwork-size-preview)',
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

  it('projects the upcoming queue in playback order without adding queue-management controls', () => {
    const { app, root } = mountInspector(true);
    const text = textContent(root);
    const firstIndex = text.indexOf('下一首歌曲');
    const secondIndex = text.indexOf('その次の曲');
    const queueList = findAll(
      root,
      (node) => node.props?.['aria-label'] === '接下來的播放佇列',
    )[0];
    const buttons = findAll(root, (node) => node.type === 'button');

    expect(queueList).toBeDefined();
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(text).toContain('接下來');
    expect(text).toContain('2 首');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props['aria-label']).toBe('摺疊播放資訊');
    app.unmount();
  });

  it('shows independent empty states when playback or the upcoming queue is absent', () => {
    const { app, root } = mount(StudioLibraryContextInspector, {
      open: true,
      currentTrack: null,
      queueSourceName: '',
      upcomingTracks: [],
    });

    expect(textContent(root)).toContain('目前沒有播放中的歌曲');
    expect(textContent(root)).toContain('佇列中沒有下一首');
    expect(textContent(root)).not.toContain('集合資料');
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
      (node) => node.props['aria-label'] === '展開播放資訊',
    )[0];

    expect(aside.props['aria-label']).toBe('播放資訊（已摺疊）');
    expect(content.props.hidden).toBe(true);
    expect(content.props['aria-hidden']).toBe(true);
    expect(expand.props['aria-expanded']).toBe(false);
    expect(String(expand.props.class)).toContain('ui-icon-btn');
    expect(String(expand.props.class)).toContain('ui-icon-btn--stretch');
    trigger(expand, 'onClick');
    expect(onToggle).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps queue chrome protected while current and upcoming metadata remain selectable', () => {
    const source = readFileSync(
      new URL('./StudioLibraryContextInspector.vue', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /\.studio-context-inspector__section-heading\s+:deep\(\.ui-chip\)\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(source).not.toMatch(
      /\.studio-context-inspector\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(source).toMatch(
      /\.studio-context-inspector__identity p,[\s\S]*?\.studio-context-inspector__queue-copy\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/u,
    );
    expect(source).toMatch(
      /\.studio-context-inspector__section\s+:deep\(\.ui-hint\)\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/su,
    );
    expect(source).toMatch(
      /\.studio-context-inspector__identity h2,[\s\S]*?\.studio-context-inspector__queue-index\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/u,
    );
    expect(source).not.toContain('UiCollageThumb');
    expect(source).toContain('UiTrackThumb');
  });
});
