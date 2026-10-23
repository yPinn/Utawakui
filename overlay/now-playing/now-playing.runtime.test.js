import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initialNowPlayingFrame,
  initialNowPlayingTemplateId,
  normalizeNowPlayingTemplateId,
} from './now-playing.mjs';

const harness = vi.hoisted(() => ({
  elements: null,
  host: null,
  motion: null,
  render: vi.fn(),
  createHost: vi.fn(),
}));
vi.mock('../shared/lifecycle.mjs', () => ({
  createOverlayHost(options) {
    harness.createHost(options);
    harness.host = options;
    return { active: true, start() {} };
  },
}));
vi.mock('./artworkMotion.mjs', () => ({
  createArtworkMotionController: () => harness.motion,
}));
vi.mock('./artworkLayout.mjs', () => ({
  collectArtworkElements: () => harness.elements,
  clearArtworkSleeve: vi.fn(),
  prepareArtworkSleeve: vi.fn(),
  renderArtworkFrame: harness.render,
  renderArtworkPlayback: vi.fn(),
}));

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
    incoming: {
      root: {},
    },
  };
}

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
      playbackStatus: 'paused',
    });
  });

  it('accepts a template query only on the bounded preview route', () => {
    const location = { search: '?preview=1&template=art-card' };
    expect(initialNowPlayingTemplateId(location, true)).toBe('art-card');
    expect(initialNowPlayingTemplateId(location, false)).toBe('art-card');
    expect(
      initialNowPlayingTemplateId({ search: '?template=unknown' }, true),
    ).toBe('art-card');
  });

  it('accepts the two remaining layouts and falls back for retired ids', () => {
    expect(normalizeNowPlayingTemplateId('now-next')).toBe('art-card');
    expect(normalizeNowPlayingTemplateId('art-card')).toBe('art-card');
    expect(normalizeNowPlayingTemplateId('cover-player')).toBe('cover-player');
    expect(normalizeNowPlayingTemplateId('unknown')).toBe('art-card');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(['art-card', 'cover-player'])(
    'boots %s without retired DOM and switches the same host between current templates',
    async (templateId) => {
      vi.resetModules();
      harness.elements = artworkElements();
      harness.host = null;
      harness.motion = {
        update: vi.fn(),
        destroy: vi.fn(),
        suspend: vi.fn(),
        setReducedMotion: vi.fn(),
      };
      vi.stubGlobal('document', {
        querySelector(selector) {
          return selector.startsWith('.artwork-overlay') ? {} : null;
        },
      });
      vi.stubGlobal('window', {
        location: { search: `?preview=1&template=${templateId}` },
      });

      await import('./now-playing.mjs');

      expect(harness.createHost).toHaveBeenCalledOnce();
      expect(harness.motion.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ active: templateId === 'art-card' }),
      );
      for (const next of ['cover-player', 'art-card', 'now-next', 'unknown']) {
        harness.render.mockClear();
        harness.host.onConfig({ templateId: next });
        const artworkMotionActive = next !== 'cover-player';
        expect(harness.motion.update).toHaveBeenLastCalledWith(
          expect.objectContaining({ active: artworkMotionActive }),
        );
        if (artworkMotionActive) expect(harness.render).not.toHaveBeenCalled();
        else
          expect(harness.render).toHaveBeenCalledWith(
            harness.elements,
            expect.objectContaining({ visible: true }),
          );
        expect(harness.createHost).toHaveBeenCalledOnce();
        if (next === 'cover-player') {
          harness.motion.setReducedMotion.mockClear();
          harness.host.onReducedMotion(true);
          expect(harness.motion.setReducedMotion).not.toHaveBeenCalled();
          harness.host.onReducedMotion(false);
          const updates = harness.motion.update.mock.calls.length;
          harness.host.onSnapshot({
            revision: 2,
            playback: {
              track: { id: 'current', title: 'Same track' },
              status: 'paused',
              positionMs: 1000,
              durationMs: 90000,
              volume: 0.35,
              muted: false,
            },
          });
          expect(harness.motion.update).toHaveBeenCalledTimes(updates);
        }
      }
    },
  );
});
