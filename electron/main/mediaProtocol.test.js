import { beforeEach, describe, expect, it, vi } from 'vitest';

const library = vi.hoisted(() => ({
  buildRangeResponse: vi.fn(),
  resolvePlaylistCoverPath: vi.fn(),
  resolveSeparationResultPath: vi.fn(),
  resolveTrackAssetPath: vi.fn(),
  resolveTrackPath: vi.fn(),
  resolveArtistPhotoPath: vi.fn(),
  resolveFolderPageAssetPath: vi.fn(),
}));

vi.mock('../lib/library', () => library);

import mediaProtocol from './mediaProtocol.js';

const { registerMediaProtocol } = mediaProtocol;

function setup() {
  let handler;
  const logger = { error: vi.fn() };
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
    resolveArtistPhotoPath: library.resolveArtistPhotoPath,
    resolveFolderPageAssetPath: library.resolveFolderPageAssetPath,
    logger,
  });
  return { getConfig, handler, logger, protocol, resolveDownloadDir };
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
  library.resolveArtistPhotoPath.mockReturnValue('E:\\Library\\photo.jpg');
  library.resolveFolderPageAssetPath.mockReturnValue(
    'E:\\Library\\folder-page-assets\\asset-1\\image.png',
  );
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

    handler(
      request(
        'utawakui-media://artist-photo/artist-0123456789abcdef/photo.jpg?v=1',
      ),
    );
    expect(library.resolveArtistPhotoPath).toHaveBeenCalledWith(
      'E:\\Library',
      'artist-0123456789abcdef',
      'photo.jpg',
    );

    handler(request('utawakui-media://folder-asset/asset%201/image.png?v=1'));
    expect(library.resolveFolderPageAssetPath).toHaveBeenCalledWith(
      'E:\\Library',
      'asset 1',
      'image.png',
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
    'utawakui-media://artist-photo/artist-0123456789abcdef',
    'utawakui-media://artist-photo/id/photo.jpg/ignored',
    'utawakui-media://folder-asset/asset-1',
    'utawakui-media://folder-asset/asset-1/image.png/ignored',
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
    expect(library.resolveArtistPhotoPath).not.toHaveBeenCalled();
    expect(library.resolveFolderPageAssetPath).not.toHaveBeenCalled();
    expect(library.buildRangeResponse).not.toHaveBeenCalled();
  });

  it.each([
    'utawakui-media://track/..%2F..%2Fsecret/audio.wav',
    'utawakui-media://track/..%2Fx/separations/preset.wav',
    'utawakui-media://playlist-cover/..%2Fx/cover.webp',
    'utawakui-media://artist-photo/..%2Fx/photo.jpg',
    'utawakui-media://folder-asset/..%2Fx/image.png',
    'utawakui-media://local/..%2F..%2Fsecret.mp3',
  ])('rejects traversal with the production resolvers: %s', (url) => {
    let handler;
    registerMediaProtocol({
      protocol: { handle: (_scheme, next) => (handler = next) },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'E:\\Library',
    });

    expect(handler(request(url)).status).toBe(404);
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
    const { handler, logger } = setup();

    const response = handler(
      request('utawakui-media://track/track-a/audio.wav'),
    );

    expect(response.status).toBe(404);
    // Categorical label only; the file path stays inside the error.
    expect(logger.error).toHaveBeenCalledWith(
      '[media] Failed to serve media',
      error,
    );
  });
});
