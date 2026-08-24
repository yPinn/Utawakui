import { describe, expect, it, vi } from 'vitest';
import overlayReloadModule from './viteOverlayReload.js';

const { createOverlayReloadPlugin } = overlayReloadModule;

function createServer() {
  return {
    watcher: { add: vi.fn() },
    ws: { send: vi.fn() },
  };
}

describe('createOverlayReloadPlugin', () => {
  it('registers the external Output Server asset tree with Vite watcher', () => {
    const plugin = createOverlayReloadPlugin('E:/Utawakui');
    const server = createServer();

    plugin.configureServer(server);

    expect(server.watcher.add).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]overlay$/u),
    );
  });

  it('fully reloads the renderer for static Output Server assets', () => {
    const plugin = createOverlayReloadPlugin('E:/Utawakui');
    const server = createServer();

    const modules = plugin.handleHotUpdate({
      file: 'E:/Utawakui/overlay/lyrics/lyrics.css',
      modules: ['stale-module'],
      server,
    });

    expect(server.ws.send).toHaveBeenCalledWith({
      type: 'full-reload',
      path: '*',
    });
    expect(modules).toEqual([]);
  });

  it('leaves renderer files and overlay tests to normal Vite handling', () => {
    const plugin = createOverlayReloadPlugin('E:/Utawakui');
    const server = createServer();

    expect(
      plugin.handleHotUpdate({
        file: 'E:/Utawakui/src/styles/tokens.css',
        modules: ['renderer-module'],
        server,
      }),
    ).toBeUndefined();
    expect(
      plugin.handleHotUpdate({
        file: 'E:/Utawakui/overlay/lyrics/lyrics.test.js',
        modules: ['test-module'],
        server,
      }),
    ).toBeUndefined();
    expect(server.ws.send).not.toHaveBeenCalled();
  });
});
