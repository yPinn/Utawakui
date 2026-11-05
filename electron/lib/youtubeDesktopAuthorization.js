'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

const READ_ONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API_ROOT = 'https://www.googleapis.com/youtube/v3/';

class PlatformVideoError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireCondition(condition, code) {
  if (!condition) throw new PlatformVideoError(code);
}

function createYoutubeDesktopAuthorization({
  clientId,
  clientSecret,
  openExternal,
  fetchImpl = fetch,
  t,
}) {
  const configured =
    typeof clientId === 'string' &&
    /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/u.test(clientId);

  async function request(url, options, tokenExchange = false) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new PlatformVideoError('unavailable');
    }
    if (!response.ok) {
      if (tokenExchange && response.status === 400) {
        const details = await response.json().catch(() => null);
        if (details?.error === 'invalid_grant')
          throw new PlatformVideoError('authRequired');
      }
      throw new PlatformVideoError(
        response.status === 401 ? 'authRequired' : 'unavailable',
      );
    }
    return response;
  }

  async function token(fields) {
    requireCondition(configured, 'notConfigured');
    const body = new URLSearchParams({ client_id: clientId, ...fields });
    if (clientSecret) body.set('client_secret', clientSecret);
    const response = await request(TOKEN_URL, { method: 'POST', body }, true);
    const data = await response.json().catch(() => null);
    requireCondition(
      typeof data?.access_token === 'string' &&
        /^[\x21-\x7e]{1,4096}$/u.test(data.access_token) &&
        Number.isFinite(data.expires_in) &&
        data.expires_in > 0 &&
        (data.scope === undefined || data.scope === READ_ONLY_SCOPE),
      'unavailable',
    );
    return {
      accessToken: data.access_token,
      refreshToken:
        typeof data.refresh_token === 'string' &&
        data.refresh_token.length <= 4096
          ? data.refresh_token
          : null,
      expiresAt: Date.now() + Math.min(data.expires_in, 3600) * 1000,
    };
  }

  async function getCode(signal) {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const state = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    let authority;
    let accept;
    let reject;
    const callback = new Promise((resolve, fail) => {
      accept = resolve;
      reject = fail;
    });
    const server = http.createServer(
      { requestTimeout: 5_000, headersTimeout: 5_000 },
      (req, res) => {
        if (
          req.method !== 'GET' ||
          req.headers.host !== authority ||
          !req.url?.startsWith('/oauth/callback?') ||
          req.url.length > 4096
        ) {
          res.writeHead(400).end();
          return;
        }
        const url = new URL(req.url, `http://${authority}`);
        if (
          url.pathname !== '/oauth/callback' ||
          url.searchParams.get('state') !== state
        ) {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const valid =
          !signal.aborted &&
          code &&
          code.length <= 2048 &&
          !url.searchParams.has('error');
        res
          .writeHead(valid ? 200 : 400, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          })
          .end(
            t(
              valid
                ? 'platformVideo.browserReturn'
                : 'platformVideo.browserCancelled',
            ),
          );
        if (valid) accept(code);
        else reject(new PlatformVideoError('cancelled'));
      },
    );
    const abort = () => reject(new PlatformVideoError('cancelled'));
    let timeout;
    try {
      await new Promise((resolve, fail) => {
        server.once('error', fail);
        server.listen(0, '127.0.0.1', resolve);
      });
      requireCondition(!signal.aborted, 'cancelled');
      authority = `127.0.0.1:${server.address().port}`;
      const redirectUri = `http://${authority}/oauth/callback`;
      const authorization = new URL(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      authorization.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: READ_ONLY_SCOPE,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent select_account',
      });
      signal.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(
        () => reject(new PlatformVideoError('timedOut')),
        120_000,
      );
      const [code] = await Promise.all([
        callback,
        openExternal(authorization.href),
      ]);
      return { code, code_verifier: verifier, redirect_uri: redirectUri };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      server.close();
      server.closeIdleConnections();
    }
  }

  return {
    configured,
    async authorize(signal) {
      requireCondition(configured, 'notConfigured');
      const fields = await getCode(signal);
      requireCondition(!signal.aborted, 'cancelled');
      return token({ ...fields, grant_type: 'authorization_code' });
    },
    refresh: (refreshToken) =>
      token({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
    async revoke(refreshToken) {
      await request(REVOKE_URL, {
        method: 'POST',
        body: new URLSearchParams({ token: refreshToken }),
      });
    },
    async get(resource, fields, accessToken) {
      const url = new URL(resource, API_ROOT);
      url.search = new URLSearchParams(fields);
      const response = await request(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json().catch(() => null);
      requireCondition(data && typeof data === 'object', 'unavailable');
      return data;
    },
  };
}

module.exports = {
  createYoutubeDesktopAuthorization,
  PlatformVideoError,
  requireCondition,
};
