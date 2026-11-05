import crypto from 'node:crypto';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createYoutubeDesktopAuthorization } from './youtubeDesktopAuthorization.js';

afterEach(() => vi.restoreAllMocks());

function mockLoopback() {
  let onRequest;
  vi.spyOn(http, 'createServer').mockImplementation((_options, handler) => {
    onRequest = handler;
    return {
      once() {},
      listen: (_port, _host, ready) => ready(),
      address: () => ({ port: 54321 }),
      close() {},
      closeIdleConnections() {},
    };
  });
  return (url) => {
    let status;
    onRequest(
      {
        method: 'GET',
        headers: { host: url.host },
        url: url.pathname + url.search,
      },
      {
        writeHead: (code) => {
          status = code;
          return { end() {} };
        },
      },
    );
    return status;
  };
}

it('exchanges a state-checked loopback authorization with the read-only PKCE scope', async () => {
  const sendCallback = mockLoopback();
  const scope = 'https://www.googleapis.com/auth/youtube.readonly';
  const fetchImpl = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          access_token: 'test-access',
          refresh_token: 'test-refresh',
          expires_in: 3600,
          scope,
        }),
      ),
  );
  let challenge;
  const youtube = createYoutubeDesktopAuthorization({
    clientId: 'test.apps.googleusercontent.com',
    fetchImpl,
    t: (key) => key,
    async openExternal(value) {
      const url = new URL(value);
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('scope')).toBe(scope);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      challenge = url.searchParams.get('code_challenge');
      const callback = new URL(url.searchParams.get('redirect_uri'));
      expect(callback.hostname).toBe('127.0.0.1');
      callback.search = new URLSearchParams({
        state: 'wrong',
        code: 'discarded',
      });
      expect(sendCallback(callback)).toBe(404);
      callback.searchParams.set('state', url.searchParams.get('state'));
      callback.searchParams.set('code', 'test-code');
      expect(sendCallback(callback)).toBe(200);
    },
  });
  const result = await youtube.authorize(new AbortController().signal);
  expect(result.refreshToken).toBe('test-refresh');
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://oauth2.googleapis.com/token');
  expect(options.redirect).toBe('error');
  expect(options.body.get('code')).toBe('test-code');
  expect(
    crypto
      .createHash('sha256')
      .update(options.body.get('code_verifier'))
      .digest('base64url'),
  ).toBe(challenge);
});

it('does not exchange an OAuth code after cancellation', async () => {
  mockLoopback();
  const controller = new AbortController();
  const fetchImpl = vi.fn();
  const youtube = createYoutubeDesktopAuthorization({
    clientId: 'test.apps.googleusercontent.com',
    fetchImpl,
    t: (key) => key,
    openExternal: async () => controller.abort(),
  });
  await expect(youtube.authorize(controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});
