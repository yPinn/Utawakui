import { describe, expect, it } from 'vitest';
import {
  buildAllOutputSlotUrls,
  buildOutputDropUrl,
  buildOutputSlotUrls,
  outputPathForKind,
} from './outputRoutes.js';

describe('output template routes', () => {
  it('keeps inspection and sample flags out of copied OBS drop URLs', () => {
    const url = new URL(
      buildOutputDropUrl(
        'http://127.0.0.1:8700/overlay/lyrics?preview=1&workbench=1&backdrop=dark&guide=1#private',
        'lyrics',
        'full',
      ),
    );
    expect([...url.searchParams.keys()]).toEqual([
      'layer-name',
      'layer-width',
      'layer-height',
    ]);
    expect(url.hash).toBe('');
  });
  it('maps three independent kinds to stable routes', () => {
    expect(outputPathForKind('now-playing')).toBe('/overlay/now-playing');
    expect(outputPathForKind('setlist')).toBe('/overlay/setlist');
    expect(outputPathForKind('lyrics')).toBe('/overlay/lyrics');
    expect(outputPathForKind('artwork')).toBeNull();
    expect(outputPathForKind('composite')).toBeNull();
  });

  it('uses the capture route in workbench without injecting demo state', () => {
    expect(
      buildOutputSlotUrls(
        { running: true, httpUrl: 'http://127.0.0.1:8700' },
        'lyrics',
      ),
    ).toEqual({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      previewUrl: 'http://127.0.0.1:8700/overlay/lyrics',
    });
    expect(
      buildOutputSlotUrls(
        {
          running: false,
          httpUrl: null,
          host: '127.0.0.1',
          port: 8700,
        },
        'lyrics',
      ),
    ).toEqual({
      obsUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      previewUrl: null,
    });
  });

  it('builds a copy target for every output kind without selecting one', () => {
    const urls = buildAllOutputSlotUrls({
      running: true,
      httpUrl: 'http://127.0.0.1:8700',
    });
    expect(Object.keys(urls)).toEqual(['lyrics', 'setlist', 'now-playing']);
    expect(urls['now-playing'].obsUrl).toBe(
      'http://127.0.0.1:8700/overlay/now-playing',
    );
  });

  it('adds OBS drop layer params from the selected capture size', () => {
    const lyrics = new URL(
      buildOutputDropUrl(
        'http://127.0.0.1:8700/overlay/lyrics',
        'lyrics',
        'full',
      ),
    );
    expect(lyrics.pathname).toBe('/overlay/lyrics');
    expect(lyrics.search).toBe(
      '?layer-name=Utawakui%20%E6%AD%8C%E8%A9%9E&layer-width=1920&layer-height=1080',
    );

    const nowPlaying = new URL(
      buildOutputDropUrl(
        'http://127.0.0.1:8700/overlay/now-playing',
        'now-playing',
        'medium',
      ),
    );
    expect(nowPlaying.searchParams.get('layer-name')).toBe('Utawakui 播放中');
    expect(nowPlaying.searchParams.get('layer-width')).toBe('480');
    expect(nowPlaying.searchParams.get('layer-height')).toBe('540');
  });

  it('omits the drop URL without a known kind, size or base URL', () => {
    expect(buildOutputDropUrl(null, 'lyrics', 'full')).toBeNull();
    expect(
      buildOutputDropUrl('http://127.0.0.1:8700/x', 'artwork', 'small'),
    ).toBeNull();
    expect(
      buildOutputDropUrl(
        'http://127.0.0.1:8700/overlay/setlist',
        'setlist',
        'huge',
      ),
    ).toBeNull();
  });
});
