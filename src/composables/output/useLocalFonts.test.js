import { describe, expect, it } from 'vitest';
import { createLocalFontsCatalog } from './useLocalFonts.js';

describe('useLocalFonts', () => {
  it('loads and normalizes fonts only after the explicit action runs', async () => {
    let calls = 0;
    const catalog = createLocalFontsCatalog({
      getQueryLocalFonts: () => async () => {
        calls += 1;
        return [
          {
            family: 'Stage Sans',
            fullName: 'Stage Sans Regular',
            postscriptName: 'StageSans-Regular',
            style: 'Regular',
          },
        ];
      },
    });

    expect(catalog.status.value).toBe('idle');
    expect(calls).toBe(0);

    await catalog.load();

    expect(calls).toBe(1);
    expect(catalog.status.value).toBe('ready');
    expect(catalog.fonts.value).toEqual([
      {
        source: 'local',
        family: 'Stage Sans',
        postscriptName: 'StageSans-Regular',
        style: 'Regular',
      },
    ]);
  });

  it('distinguishes unsupported, denied, and failed access states', async () => {
    const unsupported = createLocalFontsCatalog({
      getQueryLocalFonts: () => undefined,
    });
    await unsupported.load();
    expect(unsupported.status.value).toBe('unsupported');

    const denied = createLocalFontsCatalog({
      getQueryLocalFonts: () => async () => {
        throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
      },
    });
    await denied.load();
    expect(denied.status.value).toBe('denied');

    const failed = createLocalFontsCatalog({
      getQueryLocalFonts: () => async () => {
        throw new Error('private path C:\\font.ttf');
      },
    });
    await failed.load();
    expect(failed.status.value).toBe('error');
    expect(failed.error.value).toBe('目前無法讀取本機字體，請再試一次。');
  });
});
