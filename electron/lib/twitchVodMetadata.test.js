import { expect, it, vi } from 'vitest';
import { createTwitchVodMetadata } from './twitchVodMetadata.js';

it('uses the requested Twitch VOD ID and projects platform-provided metadata', async () => {
  const fetchImpl = vi.fn(async () =>
    Response.json({
      data: [
        { id: '456', title: 'Different VOD' },
        {
          id: '123',
          title: 'Singing session',
          user_name: 'Singer',
          created_at: '2026-10-20T12:00:00Z',
          duration: '1h2m3s',
        },
      ],
    }),
  );
  const lookup = createTwitchVodMetadata({
    clientId: 'example',
    accessToken: 'test',
    fetchImpl,
  });
  expect(await lookup('123')).toEqual({
    metadataStatus: 'ready',
    title: 'Singing session',
    channelName: 'Singer',
    videoDate: '2026-10-20T12:00:00Z',
    durationSeconds: 3723,
  });
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url.href).toBe('https://api.twitch.tv/helix/videos?id=123');
  expect(options.redirect).toBe('error');
  expect(options.method).toBeUndefined();
  expect(await lookup('999')).toEqual({ metadataStatus: 'notFound' });
});

it('leaves an unconfigured or unavailable VOD distinguishable from a missing result', async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
  expect(await createTwitchVodMetadata({ fetchImpl })('123')).toEqual({
    metadataStatus: 'unconfigured',
  });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(
    await createTwitchVodMetadata({
      clientId: 'example',
      accessToken: 'test',
      fetchImpl,
    })('123'),
  ).toEqual({ metadataStatus: 'unavailable' });
});
