'use strict';

const fs = require('node:fs');
const { atomicWriteBuffer } = require('./atomicWrite');
const { authorizeDesktopLoopback } = require('./desktopLoopbackAuthorization');
const {
  PlatformVideoError,
  requireCondition,
} = require('./youtubeDesktopAuthorization');

const ID = /^[A-Za-z0-9]{22}$/u;
const PLAYLIST_PATH =
  /^\/(?:intl-[a-z]{2}(?:-[a-z0-9]{2,8})*\/)?playlist\/([a-z0-9]{22})\/?$/iu;
const SCOPE = 'playlist-read-private';
const PROFILE_SCOPE = 'user-read-private';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PROFILE_URL = 'https://api.spotify.com/v1/me';
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

function spotifyPlaylistId(value) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\\\p{Cc}]/u.test(value)
  )
    return null;
  try {
    const url = new URL(value.trim());
    if (
      url.origin !== 'https://open.spotify.com' ||
      url.username ||
      url.password
    )
      return null;
    return PLAYLIST_PATH.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function playlistText(value) {
  return typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\p{Bidi_Control}]/gu, ' ')
        .trim()
        .slice(0, 200)
    : '';
}

function playlistTrack(entry) {
  const item = entry?.item ?? entry?.track;
  const title = playlistText(item?.name);
  if (!title || item?.type !== 'track') return { title, unavailable: true };
  const artists = Array.isArray(item.artists) ? item.artists : [];
  return {
    title,
    artist: playlistText(
      artists
        .map((artist) => playlistText(artist?.name))
        .filter(Boolean)
        .join(', '),
    ),
    album: playlistText(item.album?.name),
    duration:
      Number.isFinite(item.duration_ms) && item.duration_ms > 0
        ? item.duration_ms / 1000
        : undefined,
    isrc: playlistText(item.external_ids?.isrc),
  };
}

function profileDetails(data) {
  const name = playlistText(data?.display_name);
  const avatarUrl =
    (Array.isArray(data?.images) ? data.images : [])
      .map((image) => image?.url)
      .find(
        (value) =>
          typeof value === 'string' &&
          /^https:\/\/i\.scdn\.co\/image\/[a-z0-9]{1,128}$/iu.test(value),
      ) ?? null;
  return name || avatarUrl ? { name, avatarUrl } : null;
}

function validToken(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{1,4096}$/u.test(value);
}

function createSpotifyPlaylistReader({
  clientId,
  openExternal,
  t,
  fetchImpl = fetch,
  authorize = authorizeDesktopLoopback,
  recordAuthorization = () => {},
  accountFile,
  safeStorage,
}) {
  const configured =
    typeof clientId === 'string' && /^[a-f0-9]{32}$/iu.test(clientId);
  let profile = null;
  let profileRevision = 0;
  let accountLifetime = new AbortController();
  let linkedRefresh = null;

  function canStoreAccount() {
    return (
      Boolean(accountFile && safeStorage?.isEncryptionAvailable?.()) &&
      safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
    );
  }

  function readStoredAccount() {
    if (!accountFile || !fs.existsSync(accountFile))
      return { account: null, needsReset: false };
    if (!canStoreAccount()) return { account: null, needsReset: true };
    try {
      const data = JSON.parse(
        safeStorage.decryptString(fs.readFileSync(accountFile)),
      );
      if (
        data.clientId === clientId &&
        validToken(data.refreshToken) &&
        Number.isSafeInteger(data.savedAt) &&
        data.savedAt > 0 &&
        data.savedAt <= Date.now()
      ) {
        return { account: data, needsReset: false };
      }
    } catch {
      // A local record tied to a different encryption context can be removed.
    }
    return { account: null, needsReset: true };
  }

  function saveAccount(account) {
    requireCondition(canStoreAccount(), 'secureStorage');
    atomicWriteBuffer(
      accountFile,
      safeStorage.encryptString(JSON.stringify(account)),
    );
  }

  function getAccountStatus() {
    const { account, needsReset } = readStoredAccount();
    return {
      secure: canStoreAccount(),
      bound: Boolean(account),
      needsReset,
      savedAt: account?.savedAt ?? null,
      profile: account
        ? profileDetails({
            display_name: account.profile?.name,
            images: [{ url: account.profile?.avatarUrl }],
          })
        : profile,
    };
  }

  async function request(url, options, signal, timeout = 10_000) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
      });
      if (url === TOKEN_URL && response.status === 400) {
        const failure = await response.json().catch(() => null);
        if (
          failure?.error === 'invalid_grant' &&
          options.body?.get('grant_type') === 'refresh_token'
        )
          throw new PlatformVideoError('SPOTIFY_RECONNECT');
      }
      requireCondition(
        response.ok,
        [401, 403, 404].includes(response.status)
          ? 'SPOTIFY_ACCESS'
          : response.status === 429
            ? 'SPOTIFY_RATE'
            : 'SPOTIFY_UNAVAILABLE',
      );
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw new PlatformVideoError('cancelled');
      if (error instanceof PlatformVideoError) throw error;
      throw new PlatformVideoError('SPOTIFY_UNAVAILABLE');
    }
  }

  async function authorizeAccount(signal) {
    requireCondition(configured, 'SPOTIFY_NOT_CONFIGURED');
    let fields;
    try {
      fields = await authorize({
        signal,
        authorizationUrl: 'https://accounts.spotify.com/authorize',
        params: {
          client_id: clientId,
          scope: `${SCOPE} ${PROFILE_SCOPE}`,
          show_dialog: 'true',
        },
        openExternal,
        t,
        requireCondition,
        makeError: (code) => new PlatformVideoError(code),
      });
    } catch (error) {
      if (error instanceof PlatformVideoError) throw error;
      throw new PlatformVideoError('SPOTIFY_UNAVAILABLE');
    }
    requireCondition(!signal.aborted, 'cancelled');
    const token = await request(
      TOKEN_URL,
      {
        method: 'POST',
        body: new URLSearchParams({
          ...fields,
          grant_type: 'authorization_code',
          client_id: clientId,
        }),
      },
      signal,
    );
    const granted =
      typeof token?.scope === 'string' ? token.scope.trim().split(/\s+/u) : [];
    requireCondition(
      validToken(token?.access_token) &&
        granted.includes(SCOPE) &&
        granted.every((scope) => scope === SCOPE || scope === PROFILE_SCOPE),
      'SPOTIFY_ACCESS',
    );
    requireCondition(!signal.aborted, 'cancelled');
    return { token, granted };
  }

  async function connect(signal) {
    requireCondition(canStoreAccount(), 'secureStorage');
    const { account, needsReset } = readStoredAccount();
    requireCondition(!account && !needsReset, 'SPOTIFY_RECONNECT');
    const { token, granted } = await authorizeAccount(signal);
    requireCondition(
      validToken(token.refresh_token) && granted.includes(PROFILE_SCOPE),
      'SPOTIFY_ACCESS',
    );
    const profileData = await request(
      PROFILE_URL,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
      signal,
    );
    requireCondition(!signal.aborted, 'cancelled');
    const savedAt = Date.now();
    saveAccount({
      clientId,
      refreshToken: token.refresh_token,
      savedAt,
      profile: profileDetails(profileData),
    });
    clearProfile();
    recordAuthorization(savedAt);
  }

  function disconnect() {
    if (accountFile) {
      fs.rmSync(`${accountFile}.tmp`, { force: true });
      fs.rmSync(accountFile, { force: true });
    }
    accountLifetime.abort();
    accountLifetime = new AbortController();
    linkedRefresh = null;
    clearProfile();
  }

  async function refreshAccount(account, signal) {
    let token;
    try {
      token = await request(
        TOKEN_URL,
        {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refreshToken,
            client_id: clientId,
          }),
        },
        signal,
      );
    } catch (error) {
      if (error.code === 'SPOTIFY_RECONNECT' && !signal.aborted) disconnect();
      throw error;
    }
    requireCondition(!signal.aborted, 'cancelled');
    requireCondition(
      validToken(token?.access_token) &&
        (token.refresh_token === undefined || validToken(token.refresh_token)),
      'SPOTIFY_UNAVAILABLE',
    );
    if (token.refresh_token && token.refresh_token !== account.refreshToken)
      saveAccount({ ...account, refreshToken: token.refresh_token });
    return token.access_token;
  }

  function linkedAccessToken(account) {
    if (linkedRefresh) return linkedRefresh;
    const { signal } = accountLifetime;
    linkedRefresh = refreshAccount(account, signal).finally(() => {
      if (!signal.aborted) linkedRefresh = null;
    });
    return linkedRefresh;
  }

  async function authorizeOnce(signal) {
    const { token, granted } = await authorizeAccount(signal);
    recordAuthorization(Date.now());
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const revision = ++profileRevision;
    profile = null;
    const profileRequest = granted.includes(PROFILE_SCOPE)
      ? request(PROFILE_URL, { headers }, signal, 2_000)
          .then((data) => {
            if (!signal.aborted && revision === profileRevision)
              profile = profileDetails(data);
          })
          .catch(() => {})
      : Promise.resolve();
    return { headers, profileRequest };
  }

  async function readPlaylist(id, signal, oneTime = false) {
    requireCondition(configured, 'SPOTIFY_NOT_CONFIGURED');
    requireCondition(typeof id === 'string' && ID.test(id), 'SPOTIFY_LINK');
    const account = oneTime ? null : readStoredAccount().account;
    const readSignal = account
      ? AbortSignal.any([signal, accountLifetime.signal])
      : signal;
    const { headers, profileRequest } = account
      ? {
          headers: {
            Authorization: `Bearer ${await linkedAccessToken(account)}`,
          },
        }
      : await authorizeOnce(readSignal);
    requireCondition(!readSignal.aborted, 'cancelled');
    const endpoint = `https://api.spotify.com/v1/playlists/${id}`;
    const details = await request(
      `${endpoint}?fields=name`,
      { headers },
      readSignal,
    );
    const tracks = [];
    const deadline = Date.now() + 20_000;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await request(
        `${endpoint}/items?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        { headers },
        readSignal,
      );
      requireCondition(
        Array.isArray(result?.items) && result.items.length <= PAGE_SIZE,
        'SPOTIFY_UNAVAILABLE',
      );
      tracks.push(...result.items.map(playlistTrack));
      truncated = Boolean(result.next);
      if (!truncated || Date.now() >= deadline) break;
      requireCondition(result.items.length > 0, 'SPOTIFY_UNAVAILABLE');
    }
    await profileRequest;
    requireCondition(!readSignal.aborted, 'cancelled');
    return { id, name: playlistText(details?.name), tracks, truncated };
  }

  function clearProfile() {
    profileRevision++;
    profile = null;
  }

  return {
    configured,
    readPlaylist,
    getAccountStatus,
    connect,
    disconnect,
    clearProfile,
  };
}

module.exports = { createSpotifyPlaylistReader, spotifyPlaylistId };
