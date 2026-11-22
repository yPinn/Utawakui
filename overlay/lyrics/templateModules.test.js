import { describe, expect, it } from 'vitest';
import {
  LAZY_LYRICS_TEMPLATE_IDS,
  loadLyricsTemplateModule,
  lyricsTemplateModule,
} from './templateModules.mjs';

function fakeDocument() {
  const links = [];
  const head = {
    querySelectorAll: () => links,
    append(link) {
      links.push(link);
      queueMicrotask(() => link.listeners.load?.());
    },
  };
  return {
    links,
    head,
    createElement: () => {
      const link = {
        listeners: {},
        getAttribute(name) {
          return name === 'href' ? this.href : null;
        },
        addEventListener(type, listener) {
          this.listeners[type] = listener;
        },
        remove() {
          links.splice(links.indexOf(this), 1);
        },
      };
      return link;
    },
  };
}

describe('lyrics template modules', () => {
  it('declares only templates whose code is not needed by the shared renderer', () => {
    expect(LAZY_LYRICS_TEMPLATE_IDS).toEqual([
      'fisheye-lens',
      'phantom-thieves',
      'textured-credits',
    ]);
  });

  it('stays synchronous for templates that ship with the page', () => {
    expect(loadLyricsTemplateModule('karaoke-stack', fakeDocument())).toBe(
      null,
    );
    expect(lyricsTemplateModule('karaoke-stack')).toBe(null);
  });

  it('loads code and stylesheet once, then reports the template as ready', async () => {
    const document = fakeDocument();
    expect(lyricsTemplateModule('phantom-thieves')).toBe(null);
    const first = loadLyricsTemplateModule('phantom-thieves', document);
    const second = loadLyricsTemplateModule('phantom-thieves', document);
    expect(second).toBe(first);
    const module = await first;

    expect(typeof module.renderPhantomThieves).toBe('function');
    expect(lyricsTemplateModule('phantom-thieves')).toBe(module);
    expect(document.links.map((link) => link.href)).toEqual([
      '/overlay/lyrics/phantomThieves.css',
    ]);
    expect(loadLyricsTemplateModule('phantom-thieves', document)).toBe(null);
  });

  it('combines the fisheye lens and its effect layer into one module', async () => {
    const module = await loadLyricsTemplateModule(
      'fisheye-lens',
      fakeDocument(),
    );
    expect(typeof module.renderFisheyeLens).toBe('function');
    expect(typeof module.createFisheyeEffects).toBe('function');
  });

  it('retries in the same document without starting effect scripts after a stylesheet failure', async () => {
    const document = fakeDocument();
    const append = document.head.append.bind(document.head);
    document.head.append = (element) => {
      if (!element.href) {
        // Keep the first vendor script pending across the stylesheet failure.
        document.links.push(element);
        return;
      }
      document.links.push(element);
      queueMicrotask(() => element.listeners.error?.());
    };
    await expect(
      loadLyricsTemplateModule('textured-credits', document),
    ).rejects.toThrow('texturedCredits.css');
    expect(lyricsTemplateModule('textured-credits')).toBe(null);
    expect(document.links).toEqual([]);

    document.head.append = append;
    await loadLyricsTemplateModule('textured-credits', document);
    expect(lyricsTemplateModule('textured-credits')).not.toBe(null);
    // PixiJS IIFE builds attach to one global and must load in order.
    expect(
      document.links.map((element) => element.src).filter(Boolean),
    ).toEqual([
      '/overlay/vendor/pixi.min.js',
      '/overlay/vendor/pixi-unsafe-eval.min.js',
      '/overlay/vendor/pixi-filters.js',
    ]);
  });
});
