import { describe, expect, it } from 'vitest';
import packageMetadata from '../../package.json';
import viteConfig from '../../vite.config.js';
import { DEV_SERVER_ORIGIN, devServerUrl } from './devServer.js';

describe('dev server origin', () => {
  it('derives page URLs from the single shared origin', () => {
    expect(DEV_SERVER_ORIGIN).toBe('http://localhost:5173');
    expect(devServerUrl('performer-view.html')).toBe(
      'http://localhost:5173/performer-view.html',
    );
  });

  it('keeps Vite and the npm wait-on scripts on the same origin', () => {
    expect(`http://localhost:${viteConfig.server.port}`).toBe(
      DEV_SERVER_ORIGIN,
    );
    expect(viteConfig.server.strictPort).toBe(true);
    for (const script of ['dev', 'dev:tools']) {
      expect(packageMetadata.scripts[script]).toContain(
        `wait-on ${DEV_SERVER_ORIGIN} `,
      );
    }
  });
});
