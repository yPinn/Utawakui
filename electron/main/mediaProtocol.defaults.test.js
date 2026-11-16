import { describe, expect, it, vi } from 'vitest';
import mediaProtocol from './mediaProtocol.js';

const { registerMediaProtocol } = mediaProtocol;

describe('media protocol defaults', () => {
  it('refuses video candidates when no candidate resolver is registered', () => {
    let handler;
    const buildRangeResponse = vi.fn();
    registerMediaProtocol({
      protocol: { handle: (scheme, next) => (handler = next) },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'E:\\Library',
      buildRangeResponse,
    });

    const response = handler({
      url: 'utawakui-media://video-candidate/track-a/token',
      headers: new Headers(),
    });

    expect(response.status).toBe(404);
    expect(buildRangeResponse).not.toHaveBeenCalled();
  });
});
