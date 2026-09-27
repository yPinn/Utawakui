import { beforeEach, describe, expect, it, vi } from 'vitest';

const library = vi.hoisted(() => ({
  buildRangeResponse: vi.fn(),
  resolvePlaylistCoverPath: vi.fn(),
  resolveSeparationResultPath: vi.fn(),
  resolveTrackAssetPath: vi.fn(),
  resolveTrackPath: vi.fn(),
}));

vi.mock('../lib/library', () => library);

import mediaProtocol from './mediaProtocol.js';

const { registerMediaProtocol } = mediaProtocol;

function setup() {
  let handler;
  const protocol = {
    handle: vi.fn((scheme, nextHandler) => {
      handler = nextHandler;
    }),
  };
  const getConfig = vi.fn(() => ({ downloadDir: 'configured' }));
  const resolveDownloadDir = vi.fn(() => 'E:\\Library');
  registerMediaProtocol({
    protocol,
    getConfig,
    resolveDownloadDir,
    buildRangeResponse: library.buildRangeResponse,
    resolvePlaylistCoverPath: library.resolvePlaylistCoverPath,
    resolveSeparationResultPath: library.resolveSeparationResultPath,
    resolveTrackAssetPath: library.resolveTrackAssetPath,
    resolveTrackPath: library.resolveTrackPath,
  });
  return { getConfig, handler, protocol, resolveDownloadDir };
}

function request(url, range = null) {
  return {
    url,
    headers: new Headers(range ? { range } : {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  library.buildRangeResponse.mockReturnValue(
    new Response('media', { status: 206 }),
  );
  library.resolveTrackAssetPath.mockReturnValue('E:\\Library\\asset.wav');
  library.resolveSeparationResultPath.mockReturnValue(
    'E:\\Library\\separation.wav',
  );
  library.resolvePlaylistCoverPath.mockReturnValue('E:\\Library\\cover.webp');
  library.resolveTrackPath.mockReturnValue('E:\\Library\\legacy.mp3');
});

describe('registerMediaProtocol', () => {
  it('registers the fixed scheme and forwards byte ranges for track assets', () => {
    const { getConfig, handler, protocol, resolveDownloadDir } = setup();

    const response = handler(
      request('utawakui-media://track/track%201/audio.wav', 'bytes=100-199'),
    );

    expect(protocol.handle).toHaveBeenCalledWith(
      'utawakui-media',
      expect.any(Function),
    );
    expect(getConfig).toHaveBeenCalledTimes(1);
    expect(resolveDownloadDir).toHaveBeenCalledWith({
      downloadDir: 'configured',
    });
    expect(library.resolveTrackAssetPath).toHaveBeenCalledWith(
      'E:\\Library',
      'track 1',
      'audio.wav',
    );
    expect(library.buildRangeResponse).toHaveBeenCalledWith(
      'E:\\Library\\asset.wav',
      'bytes=100-199',
    );
    expect(response.status).toBe(206);
  });

  it('routes separation results, playlist covers, and legacy local audio', () => {
    const { handler } = setup();

    handler(
      request('utawakui-media://track/track-a/separations/general%20v2.wav'),
    );
    expect(library.resolveSeparationResultPath).toHaveBeenCalledWith(
      'E:\\Library',
      'track-a',
      'general v2.wav',
    );

    handler(
      request('utawakui-media://playlist-cover/playlist%201/cover%20art.webp'),
    );
    expect(library.resolvePlaylistCoverPath).toHaveBeenCalledWith(
      'E:\\Library',
      'playlist 1',
      'cover art.webp',
    );

    handler(request('utawakui-media://local/legacy%20song.mp3'));
    expect(library.resolveTrackPath).toHaveBeenCalledWith(
      'E:\\Library',
      'legacy song.mp3',
    );
  });

  it.each([
    'utawakui-media://unknown/file.mp3',
    'utawakui-media://track/id/audio.wav/ignored',
    'utawakui-media://track/id/separations/preset.wav/ignored',
    'utawakui-media://playlist-cover/id/cover.webp/ignored',
    'utawakui-media://local/file.mp3/ignored',
    'utawakui-media://track/%E0%A4%A/audio.wav',
  ])('fails closed for a non-allowlisted route: %s', (url) => {
    const { handler } = setup();

    const response = handler(request(url));

    expect(response.status).toBe(404);
    expect(library.resolveTrackAssetPath).not.toHaveBeenCalled();
    expect(library.resolveSeparationResultPath).not.toHaveBeenCalled();
    expect(library.resolvePlaylistCoverPath).not.toHaveBeenCalled();
    expect(library.resolveTrackPath).not.toHaveBeenCalled();
    expect(library.buildRangeResponse).not.toHaveBeenCalled();
  });

  it('returns 404 when a resolver rejects the bounded route', () => {
    library.resolveTrackAssetPath.mockReturnValue(null);
    const { handler } = setup();

    const response = handler(
      request('utawakui-media://track/track-a/audio.wav'),
    );

    expect(response.status).toBe(404);
    expect(library.buildRangeResponse).not.toHaveBeenCalled();
  });

  it('returns 404 while the configured library location is unavailable', () => {
    const { handler, resolveDownloadDir } = setup();
    resolveDownloadDir.mockImplementation(() => {
      throw new Error('library unavailable');
    });

    const response = handler(
      request('utawakui-media://track/track-a/audio.wav'),
    );

    expect(response.status).toBe(404);
    expect(library.resolveTrackAssetPath).not.toHaveBeenCalled();
    expect(library.buildRangeResponse).not.toHaveBeenCalled();
  });

  it('turns a deleted-file race into a logged 404 response', () => {
    const error = new Error('ENOENT');
    library.buildRangeResponse.mockImplementation(() => {
      throw error;
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { handler } = setup();

    const response = handler(
      request('utawakui-media://track/track-a/audio.wav'),
    );

    expect(response.status).toBe(404);
    expect(consoleError).toHaveBeenCalledWith(
      'utawakui-media: failed to serve E:\\Library\\asset.wav:',
      error,
    );
    consoleError.mockRestore();
  });
});
