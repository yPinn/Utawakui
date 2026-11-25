'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

async function authorizeDesktopLoopback({
  signal,
  authorizationUrl,
  params,
  openExternal,
  t,
  requireCondition,
  makeError,
}) {
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
      else reject(makeError('cancelled'));
    },
  );
  const abort = () => reject(makeError('cancelled'));
  let timeout;
  try {
    await new Promise((resolve, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', resolve);
    });
    requireCondition(!signal.aborted, 'cancelled');
    authority = `127.0.0.1:${server.address().port}`;
    const redirectUri = `http://${authority}/oauth/callback`;
    const authorization = new URL(authorizationUrl);
    authorization.search = new URLSearchParams({
      ...params,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    signal.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => reject(makeError('timedOut')), 120_000);
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

module.exports = { authorizeDesktopLoopback };
