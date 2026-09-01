import { describe, expect, it } from 'vitest';
import {
  initialNowPlayingFrame,
  initialNowPlayingTemplateId,
  isArtworkTemplate,
  normalizeNowPlayingTemplateId,
  renderNowPlayingTemplate,
} from './now-playing.mjs';

function compactElements() {
  return {
    root: { hidden: true, dataset: {} },
    title: { textContent: '' },
    artist: { textContent: '' },
    next: { textContent: '' },
  };
}

function artworkElements() {
  return {
    root: {
      hidden: true,
      dataset: {},
      style: {
        setProperty: () => undefined,
        removeProperty: () => undefined,
      },
    },
    image: {
      hidden: true,
      dataset: {},
      removeAttribute: () => undefined,
      onload: null,
      onerror: null,
    },
    fallback: { hidden: false, textContent: '' },
    title: { textContent: '' },
    artist: { textContent: '' },
    elapsed: { textContent: '' },
    remaining: { textContent: '' },
  };
}

const frame = {
  revision: 2,
  visible: true,
  trackId: '',
  title: 'Song',
  artist: 'Singer',
  nextTitle: 'Next',
  playbackStatus: 'playing',
  positionMs: 1000,
  durationMs: 2000,
  progress: 0.5,
};

describe('Now Playing template runtime', () => {
  it('starts live Output empty and reserves sample content for preview mode', () => {
    expect(initialNowPlayingFrame(false)).toMatchObject({
      visible: false,
      trackId: '',
      playbackStatus: 'idle',
    });
    expect(initialNowPlayingFrame(true)).toMatchObject({
      visible: true,
      trackId: 'preview-track',
      playbackStatus: 'playing',
    });
  });

  it('accepts a template query only on the bounded preview route', () => {
    const location = { search: '?preview=1&template=art-card' };
    expect(initialNowPlayingTemplateId(location, true)).toBe('art-card');
    expect(initialNowPlayingTemplateId(location, false)).toBe('now-next');
    expect(
      initialNowPlayingTemplateId({ search: '?template=unknown' }, true),
    ).toBe('now-next');
  });

  it('owns all three track-information layouts', () => {
    expect(normalizeNowPlayingTemplateId('now-next')).toBe('now-next');
    expect(normalizeNowPlayingTemplateId('art-card')).toBe('art-card');
    expect(normalizeNowPlayingTemplateId('cover-player')).toBe('cover-player');
    expect(normalizeNowPlayingTemplateId('unknown')).toBe('now-next');
    expect(isArtworkTemplate('now-next')).toBe(false);
    expect(isArtworkTemplate('art-card')).toBe(true);
    expect(isArtworkTemplate('cover-player')).toBe(true);
  });

  it('switches visible layouts from config without replacing the connection', () => {
    const compact = compactElements();
    const artwork = artworkElements();

    renderNowPlayingTemplate({
      compactElements: compact,
      artworkElements: artwork,
      templateId: 'art-card',
      frame,
    });
    expect(compact.root.hidden).toBe(true);
    expect(artwork.root.hidden).toBe(false);

    renderNowPlayingTemplate({
      compactElements: compact,
      artworkElements: artwork,
      templateId: 'now-next',
      frame,
    });
    expect(compact.root.hidden).toBe(false);
    expect(artwork.root.hidden).toBe(true);
  });

  it('does not hydrate artwork while the compact layout is active', () => {
    const compact = compactElements();
    const artwork = artworkElements();

    renderNowPlayingTemplate({
      compactElements: compact,
      artworkElements: artwork,
      templateId: 'now-next',
      frame,
    });

    expect(compact.root.hidden).toBe(false);
    expect(artwork.root.hidden).toBe(true);
    expect(artwork.title.textContent).toBe('');
    expect(artwork.image.dataset.trackId).toBeUndefined();
  });
});
