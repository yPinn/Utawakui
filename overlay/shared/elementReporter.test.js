import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_TEMPLATE_ELEMENTS } from '../../shared/outputTemplateElements.mjs';
import {
  collectElementBoxes,
  startElementReporter,
} from './elementReporter.mjs';
import { startWorkbenchElementReporter } from './preview.mjs';

function rect(left, top, width, height) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function fakeDocument(nodesById) {
  return {
    documentElement: {},
    fonts: { ready: Promise.resolve() },
    querySelectorAll(selector) {
      const id = selector.match(/data-ovl-element="([^"]+)"/u)?.[1];
      return (nodesById[id] ?? []).map((box) => ({
        getBoundingClientRect: () => box,
      }));
    },
  };
}

function fakeWindow() {
  const frames = [];
  const window = {
    innerWidth: 360,
    innerHeight: 480,
    parent: { postMessage: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn((callback) => frames.push(callback)),
    cancelAnimationFrame: vi.fn(),
    MutationObserver: class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
    ResizeObserver: class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
    flush() {
      frames.splice(0).forEach((callback) => callback());
    },
  };
  return window;
}

describe('output element reporter', () => {
  it('unions visible nodes per element and skips hidden ones', () => {
    const document = fakeDocument({
      progress: [rect(20, 400, 320, 4), rect(20, 410, 320, 12)],
      artist: [rect(20, 350, 0, 0)],
    });
    expect(
      collectElementBoxes(document, ['progress', 'artist', 'title']),
    ).toEqual([{ id: 'progress', x: 20, y: 400, width: 320, height: 22 }]);
  });

  it('posts deduplicated boxes to the parent and never listens for messages', async () => {
    const window = fakeWindow();
    const document = fakeDocument({ title: [rect(20, 300, 200, 24)] });
    const reporter = startElementReporter({
      window,
      document,
      getTemplateId: () => 'cover-player',
    });
    window.flush();
    reporter.schedule();
    window.flush();

    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    const [message, targetOrigin] = window.parent.postMessage.mock.calls[0];
    expect(targetOrigin).toBe('*');
    expect(message).toMatchObject({
      templateId: 'cover-player',
      viewport: { width: 360, height: 480 },
      elements: [{ id: 'title', x: 20, y: 300, width: 200, height: 24 }],
    });
    expect(
      window.addEventListener.mock.calls.map(([type]) => type),
    ).not.toContain('message');

    reporter.dispose();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
  });

  it('loads only inside a framed Workbench preview', async () => {
    const top = { location: { search: '?workbench=1' }, document: {} };
    top.parent = top;
    await expect(startWorkbenchElementReporter(top, () => '')).resolves.toBe(
      null,
    );
    const obs = {
      location: { search: '' },
      parent: {},
      document: {},
    };
    await expect(startWorkbenchElementReporter(obs, () => '')).resolves.toBe(
      null,
    );
  });

  it('tags a node for every declared Cover Player element', () => {
    const html = readFileSync(
      fileURLToPath(new URL('../now-playing/index.html', import.meta.url)),
      'utf8',
    );
    for (const { id } of OUTPUT_TEMPLATE_ELEMENTS['cover-player']) {
      expect(html).toContain(`data-ovl-element="${id}"`);
    }
    expect(html).not.toMatch(/incoming-[a-z]+"[^>]*data-ovl-element/u);
  });
});
