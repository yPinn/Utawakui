import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import LibraryAlbumCard from './LibraryAlbumCard.vue';

for (const [component, filename] of [
  [LibraryAlbumCard, './LibraryAlbumCard.vue'],
  [PlaybackPrimaryButton, '../playback/PlaybackPrimaryButton.vue'],
  [UiArtworkReveal, '../ui/UiArtworkReveal.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const album = {
  id: 'album-one',
  name: 'chasing ghosts',
  coverUrl: '',
  releaseYear: 2026,
  tracks: [{ id: 'track-one', title: 'midnight' }],
};

const source = readFileSync(
  new URL('./LibraryAlbumCard.vue', import.meta.url),
  'utf8',
);

describe('LibraryAlbumCard', () => {
  it('presents one full-card navigation action and one artwork playback action', () => {
    const mounted = mount(LibraryAlbumCard, { album });
    const buttons = findAll(mounted.root, (node) => node.type === 'button');
    const openButton = buttons.find(
      (button) => button.props['aria-label'] === '開啟專輯：chasing ghosts',
    );
    const playButton = buttons.find((button) =>
      textContent(button).includes('播放專輯：chasing ghosts'),
    );
    const thumb = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('ui-collage-thumb'),
    )[0];

    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBe(openButton);
    expect(buttons[1]).toBe(playButton);
    expect(openButton).toBeDefined();
    expect(playButton).toBeDefined();
    expect(textContent(mounted.root)).toContain('chasing ghosts');
    expect(textContent(mounted.root)).toContain('2026');
    expect(thumb.props.style.width).toBe('136px');
    expect(thumb.props.style.height).toBe('136px');
    mounted.app.unmount();
  });

  it('keeps playback independent from full-card navigation', () => {
    const onSelect = vi.fn();
    const onPlay = vi.fn();
    const mounted = mount(LibraryAlbumCard, { album, onSelect, onPlay });
    const buttons = findAll(mounted.root, (node) => node.type === 'button');
    const openButton = buttons.find(
      (button) => button.props['aria-label'] === '開啟專輯：chasing ghosts',
    );
    const playButton = buttons.find((button) =>
      textContent(button).includes('播放專輯：chasing ghosts'),
    );
    const playEvent = { stopPropagation: vi.fn() };

    trigger(playButton, 'onClick', playEvent);

    expect(onPlay).toHaveBeenCalledOnce();
    expect(onPlay).toHaveBeenCalledWith('album-one');
    expect(onSelect).not.toHaveBeenCalled();
    expect(playEvent.stopPropagation).toHaveBeenCalledOnce();

    trigger(openButton, 'onClick');

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('album-one');
    mounted.app.unmount();
  });

  it('projects the current album as a pause action', () => {
    const mounted = mount(LibraryAlbumCard, { album, playing: true });
    const pauseButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' &&
        textContent(node).includes('暫停專輯：chasing ghosts'),
    )[0];

    expect(pauseButton).toBeDefined();
    expect(textContent(mounted.root)).not.toContain('播放專輯：chasing ghosts');
    mounted.app.unmount();
  });

  it('omits missing metadata without inventing a placeholder', () => {
    const mounted = mount(LibraryAlbumCard, {
      album: { ...album, releaseYear: null },
    });
    const copy = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('library-album-card__copy'),
    )[0];

    expect(textContent(copy)).toBe('chasing ghosts');
    mounted.app.unmount();
  });

  it('uses semantic card states and reveals the accent control at the artwork bottom end', () => {
    expect(source).toContain(
      "import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue'",
    );
    expect(source).toContain(
      "import UiArtworkReveal from '../ui/UiArtworkReveal.vue'",
    );
    expect(source).toContain('data-artwork-reveal-scope="focus-within"');
    expect(source).toMatch(
      /\.library-album-card\s*\{[^}]*background:\s*transparent;/su,
    );
    expect(source).not.toContain('background: var(--ui-color-surface-raised)');
    expect(source).toContain('background: var(--ui-color-surface-hover)');
    expect(source).toContain('background: var(--ui-color-surface-active)');
    expect(source).toContain('border-radius: var(--ui-radius-md)');
    expect(source).toContain('outline: var(--ui-focus-width) solid');
    expect(source).toMatch(
      /\.library-album-card__play\s*\{[^}]*grid-area:\s*1\s*\/\s*1;[^}]*align-self:\s*end;[^}]*justify-self:\s*end;[^}]*margin:\s*var\(--ui-space-2\);/su,
    );
    expect(source).toMatch(
      /\.library-album-card__play\s+:deep\(\.ui-icon-btn\)\s*\{[^}]*box-shadow:\s*var\(--ui-shadow-overlay\);/su,
    );
  });
});
