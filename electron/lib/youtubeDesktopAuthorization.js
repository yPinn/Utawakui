'use strict';

const { authorizeDesktopLoopback } = require('./desktopLoopbackAuthorization');

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

  return {
    configured,
    async authorize(signal) {
      requireCondition(configured, 'notConfigured');
      const fields = await authorizeDesktopLoopback({
        signal,
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        params: {
          client_id: clientId,
          scope: READ_ONLY_SCOPE,
          access_type: 'offline',
          prompt: 'consent select_account',
        },
        openExternal,
        t,
        requireCondition,
        makeError: (code) => new PlatformVideoError(code),
      });
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
