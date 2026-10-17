import { describe, expect, it } from 'vitest';
import sharedAssets from './viteSharedAssets.js';

const {
  SHARED_OUTPUT_DIR,
  assetFileNames,
  createSharedAssetsPlugin,
  renderBuiltUrl,
  sharedAssetPath,
} = sharedAssets;

describe('Vite shared asset plugin', () => {
  it('recognizes only shared font sources', () => {
    expect(sharedAssetPath('shared/assets/fonts/Keifont.ttf')).toBe(
      'shared/assets/fonts/Keifont.ttf',
    );
    expect(sharedAssetPath('shared\\assets\\fonts\\Keifont.ttf')).toBe(
      'shared/assets/fonts/Keifont.ttf',
    );
    expect(sharedAssetPath('src/assets/track-artwork/red.png')).toBeNull();
    expect(sharedAssetPath(undefined)).toBeNull();
  });

  it('parks shared fonts outside assets and keeps hashed names for the rest', () => {
    expect(
      assetFileNames({
        originalFileNames: ['shared/assets/fonts/Keifont.ttf'],
      }),
    ).toBe(`${SHARED_OUTPUT_DIR}/shared/assets/fonts/Keifont.ttf`);
    expect(assetFileNames({ originalFileNames: ['src/a.png'] })).toBe(
      'assets/[name]-[hash][extname]',
    );
    expect(assetFileNames({ name: 'main.css' })).toBe(
      'assets/[name]-[hash][extname]',
    );
  });

  it('points emitted CSS at the packaged shared copy beside dist', () => {
    const font = `${SHARED_OUTPUT_DIR}/shared/assets/fonts/Keifont.ttf`;

    expect(
      renderBuiltUrl(font, { hostId: 'DisplayPage.css', hostType: 'css' }),
    ).toBe('../../shared/assets/fonts/Keifont.ttf');
    expect(
      renderBuiltUrl(font, { hostId: 'nested/Page.css', hostType: 'css' }),
    ).toBe('../../../shared/assets/fonts/Keifont.ttf');
    expect(
      renderBuiltUrl('assets/a-123.png', { hostId: 'x.css', hostType: 'css' }),
    ).toBeUndefined();
  });

  it('refuses shared assets referenced from JS, where relative URLs would break', () => {
    expect(() =>
      renderBuiltUrl(`${SHARED_OUTPUT_DIR}/shared/assets/fonts/Keifont.ttf`, {
        hostId: 'main.js',
        hostType: 'js',
      }),
    ).toThrow(/only be referenced from CSS/u);
  });

  it('drops parked shared assets from the bundle during build only', () => {
    const plugin = createSharedAssetsPlugin();
    const bundle = {
      [`${SHARED_OUTPUT_DIR}/shared/assets/fonts/Keifont.ttf`]: {},
      'assets/main-abc.js': {},
    };

    plugin.generateBundle({}, bundle);

    expect(plugin.apply).toBe('build');
    expect(Object.keys(bundle)).toEqual(['assets/main-abc.js']);
  });
});
