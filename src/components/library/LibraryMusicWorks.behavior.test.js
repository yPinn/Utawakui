import { h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
vi.mock('../ui/UiScrollLayout.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('../layout/AppFolderSection.vue', () => ({
  default: {
    props: ['title'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', [h('h2', props.title), slots.default?.()]),
  },
}));
vi.mock('./LibraryAlbumCard.vue', () => ({
  default: {
    props: ['album', 'loading'],
    emits: ['select'],
    setup:
      (props, { emit }) =>
      () =>
        props.loading
          ? null
          : h(
              'button',
              { onClick: () => emit('select', props.album.id) },
              props.album.name,
            ),
  },
}));
import LibraryAlbumSupportingContent from './LibraryAlbumSupportingContent.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiHint from '../ui/UiHint.vue';
for (const [component, path] of [
  [LibraryAlbumSupportingContent, './LibraryAlbumSupportingContent.vue'],
  [UiTabs, '../ui/UiTabs.vue'],
  [UiHint, '../ui/UiHint.vue'],
])
  attachClientRender(component, path, import.meta.url);
describe('artist music works shared section', () => {
  it('uses a content-width category control and plain Chinese release labels', () => {
    const source = readFileSync(
      new URL('./LibraryAlbumSupportingContent.vue', import.meta.url),
      'utf8',
    );
    expect(source).toContain("label: '單曲與迷你專輯'");
    expect(source).toContain('class="library-album-supporting__filters"');
    expect(source).toContain('<UiTabs');
    expect(source).toContain('variant="bar"');
    expect(source).not.toContain('UiSegmentedControl');
    expect(source).toMatch(
      /\.library-album-supporting__filters\s*\{[^}]*justify-self:\s*start;/u,
    );
    expect(source).toMatch(
      /\.library-album-supporting__filters\s*\{[^}]*inline-size:\s*fit-content;/u,
    );
  });
  it('filters the same release cards and routes a Single to the existing collection view', async () => {
    const onSelectAlbum = vi.fn();
    const mounted = mount(LibraryAlbumSupportingContent, {
      artist: '9Lana',
      albumsTitle: '音樂作品',
      releaseFilters: true,
      relatedAlbums: [
        { id: 'a', name: 'Album', releaseType: 'album' },
        { id: 's', name: 'Single', releaseType: 'single' },
        { id: 'e', name: 'EP', releaseType: 'ep' },
        { id: 'u', name: 'Unknown', releaseType: 'unknown' },
      ],
      onSelectAlbum,
    });
    const button = (text) =>
      findAll(mounted.root, (node) => node.type === 'button').find(
        (node) => textContent(node) === text,
      );
    expect(textContent(mounted.root)).toContain('音樂作品');
    expect(button('Unknown')).toBeTruthy();
    trigger(button('專輯'), 'onClick');
    await nextTick();
    expect(button('Album')).toBeTruthy();
    expect(button('Single')).toBeUndefined();
    expect(button('Unknown')).toBeUndefined();
    trigger(button('單曲與迷你專輯'), 'onClick');
    await nextTick();
    expect(button('Single')).toBeTruthy();
    expect(button('EP')).toBeTruthy();
    expect(button('Album')).toBeUndefined();
    trigger(button('Single'), 'onClick');
    expect(onSelectAlbum).toHaveBeenCalledWith('s');
    trigger(button('全部'), 'onClick');
    await nextTick();
    expect(button('Unknown')).toBeTruthy();
    mounted.app.unmount();
  });
  it('keeps the filters visible when a category has no members', async () => {
    const mounted = mount(LibraryAlbumSupportingContent, {
      artist: '9Lana',
      albumsTitle: '音樂作品',
      releaseFilters: true,
      relatedAlbums: [{ id: 'u', name: 'Unknown', releaseType: 'unknown' }],
    });
    const button = findAll(mounted.root, (node) => node.type === 'button').find(
      (node) => textContent(node) === '專輯',
    );
    trigger(button, 'onClick');
    await nextTick();
    expect(textContent(mounted.root)).toContain('目前沒有符合分類的發行');
    expect(
      findAll(mounted.root, (node) => node.props.role === 'tablist'),
    ).toHaveLength(1);
    mounted.app.unmount();
  });
  it('keeps keyboard tabs connected to the active release panel', async () => {
    const mounted = mount(LibraryAlbumSupportingContent, {
      artist: 'Test',
      releaseFilters: true,
      relatedAlbums: [
        { id: 'a', name: 'Album', releaseType: 'album' },
        { id: 's', name: 'Single', releaseType: 'single' },
      ],
    });
    const tabs = findAll(mounted.root, (node) => node.props.role === 'tab');
    trigger(tabs[0], 'onKeydown', {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    });
    await nextTick();
    expect(tabs[1].props['aria-selected']).toBe(true);
    const panel = findAll(
      mounted.root,
      (node) => node.props.role === 'tabpanel',
    )[0];
    expect(tabs[1].props['aria-controls']).toBe(panel.props.id);
    expect(panel.props['aria-labelledby']).toBe(tabs[1].props.id);
    expect(textContent(panel)).toContain('Album');
    expect(textContent(panel)).not.toContain('Single');
    mounted.app.unmount();
  });
});
