'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteBuffer } = require('./atomicWrite');
const { requireCondition } = require('./youtubeDesktopAuthorization');

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/u;
const CHANNEL_ID = /^UC[a-zA-Z0-9_-]{22}$/u;
const TWITCH_ID = /^\d{1,20}$/u;
const SESSION_ID = /^[a-zA-Z0-9_-]{1,128}$/u;
const FILE_LIMIT = 2_000_000;
const VIDEO_LIMIT = 5000;
const AUTHORIZED_DATA_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const TWITCH_METADATA_MAX_AGE = 24 * 60 * 60 * 1000;

function authorizedDataIsCurrent(checkedAt) {
  return (
    Number.isFinite(checkedAt) &&
    checkedAt <= Date.now() &&
    Date.now() - checkedAt < AUTHORIZED_DATA_MAX_AGE
  );
}

function parsePlatformVideo(platform, value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password)
    return null;
  if (
    platform === 'twitch' &&
    ['twitch.tv', 'www.twitch.tv'].includes(url.hostname)
  ) {
    return /^\/videos\/(\d{1,20})\/?$/u.exec(url.pathname)?.[1] ?? null;
  }
  if (platform !== 'youtube') return null;
  let id;
  if (url.hostname === 'youtu.be')
    id = /^\/([^/]+)\/?$/u.exec(url.pathname)?.[1];
  if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
  ) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:live|shorts)\/([^/]+)\/?$/u.exec(url.pathname)?.[1];
  }
  return typeof id === 'string' && VIDEO_ID.test(id) ? id : null;
}

function validatePlatform(platform) {
  requireCondition(
    platform === 'youtube' || platform === 'twitch',
    'invalidVideo',
  );
}

function readLocal(filePath, decode) {
  try {
    const file = fs.readFileSync(filePath);
    requireCondition(file.length <= FILE_LIMIT, 'failed');
    return decode(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function boundedText(value) {
  return typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .trim()
        .slice(0, 200)
    : '';
}

function boundedVideoTitle(value) {
  if (typeof value !== 'string') return '';
  // Keep emoji joiners while removing control and bidirectional formatting characters.
  const title = value.replace(/[\p{Cc}\p{Bidi_Control}]/gu, ' ').trim();
  return Array.from(title).slice(0, 1024).join('');
}

function createSessionPlatformVideos({
  directory,
  safeStorage,
  youtube,
  openExternal,
  getTwitchVod = async () => ({ metadataStatus: 'unconfigured' }),
}) {
  const accountFile = path.join(directory, 'youtube-desktop-account.bin');
  const pairsFile = path.join(directory, 'session-platform-videos.json');
  let connection = null;
  let disconnecting = false;
  let access = null;
  let refresh = null;
  let epoch = 0;

  function readAccount() {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const account = readLocal(accountFile, (file) => {
      let data;
      try {
        data = JSON.parse(safeStorage.decryptString(file));
      } catch {
        requireCondition(false, 'secureStorage');
      }
      requireCondition(
        typeof data?.channelId === 'string' &&
          CHANNEL_ID.test(data.channelId) &&
          typeof data.refreshToken === 'string' &&
          data.refreshToken.length > 0 &&
          data.refreshToken.length <= 4096,
        'failed',
      );
      return data;
    });
    if (account && !authorizedDataIsCurrent(account.checkedAt)) {
      forgetAccount();
      return null;
    }
    return account;
  }

  function status() {
    let account;
    const secure = safeStorage.isEncryptionAvailable();
    let needsReset = !secure && fs.existsSync(accountFile);
    try {
      account = readAccount();
    } catch (error) {
      if (error.code !== 'secureStorage') throw error;
      needsReset = true;
    }
    return {
      configured: youtube.configured,
      secure,
      needsReset,
      channel: account
        ? { id: account.channelId, name: boundedText(account.channelName) }
        : null,
    };
  }

  function readPairs() {
    const pairs =
      readLocal(pairsFile, (file) => JSON.parse(file.toString('utf8'))) ?? [];
    requireCondition(
      Array.isArray(pairs) &&
        pairs.length <= VIDEO_LIMIT &&
        pairs.every(
          (pair) =>
            typeof pair?.sessionId === 'string' &&
            SESSION_ID.test(pair.sessionId) &&
            typeof pair.videoId === 'string' &&
            (pair.platform === 'twitch'
              ? TWITCH_ID.test(pair.videoId) && !pair.channelId
              : pair.platform === 'youtube' &&
                VIDEO_ID.test(pair.videoId) &&
                (!pair.channelId ||
                  (typeof pair.channelId === 'string' &&
                    CHANNEL_ID.test(pair.channelId)))),
        ),
      'failed',
    );
    const current = pairs.filter(
      (pair) => !pair.channelId || authorizedDataIsCurrent(pair.checkedAt),
    );
    if (current.length !== pairs.length) savePairs(current);
    return current;
  }

  function savePairs(pairs) {
    requireCondition(pairs.length <= VIDEO_LIMIT, 'failed');
    const file = Buffer.from(JSON.stringify(pairs));
    requireCondition(file.length <= FILE_LIMIT, 'failed');
    atomicWriteBuffer(pairsFile, file);
  }

  function forgetAccount() {
    const pairs = readPairs();
    const retained = pairs.filter((pair) => !pair.channelId);
    if (retained.length !== pairs.length) savePairs(retained);
    fs.rmSync(accountFile, { force: true });
    epoch++;
    access = null;
    refresh = null;
  }

  async function connect() {
    requireCondition(youtube.configured, 'notConfigured');
    requireCondition(safeStorage.isEncryptionAvailable(), 'secureStorage');
    requireCondition(!connection && !disconnecting && !readAccount(), 'busy');
    const controller = new AbortController();
    connection = controller;
    try {
      const token = await youtube.authorize(controller.signal);
      requireCondition(!controller.signal.aborted, 'cancelled');
      requireCondition(token.refreshToken, 'unavailable');
      const result = await youtube.get(
        'channels',
        { part: 'id,snippet', mine: 'true', maxResults: '2' },
        token.accessToken,
      );
      requireCondition(!controller.signal.aborted, 'cancelled');
      const channel = result.items?.[0];
      requireCondition(
        result.items?.length === 1 &&
          !result.nextPageToken &&
          CHANNEL_ID.test(channel?.id ?? ''),
        'wrongChannel',
      );
      atomicWriteBuffer(
        accountFile,
        safeStorage.encryptString(
          JSON.stringify({
            channelId: channel.id,
            channelName: boundedText(channel.snippet?.title),
            refreshToken: token.refreshToken,
            checkedAt: Date.now(),
          }),
        ),
      );
      epoch++;
      access = { accessToken: token.accessToken, expiresAt: token.expiresAt };
      return status();
    } finally {
      connection = null;
    }
  }

  function cancel() {
    connection?.abort();
  }

  async function disconnect() {
    requireCondition(!connection && !disconnecting, 'busy');
    let account;
    let revoked = !fs.existsSync(accountFile);
    try {
      account = readAccount();
    } catch (error) {
      if (error.code !== 'secureStorage') throw error;
    }
    forgetAccount();
    if (account) {
      disconnecting = true;
      try {
        await youtube.revoke(account.refreshToken);
        revoked = true;
      } catch {
        revoked = false;
      } finally {
        disconnecting = false;
      }
    }
    return { ...status(), revoked };
  }

  async function accessToken(account, revision) {
    if (access && access.expiresAt - Date.now() > 30_000)
      return access.accessToken;
    refresh ??= youtube.refresh(account.refreshToken).finally(() => {
      if (epoch === revision) refresh = null;
    });
    const updated = await refresh;
    requireCondition(epoch === revision, 'authRequired');
    access = { accessToken: updated.accessToken, expiresAt: updated.expiresAt };
    return access.accessToken;
  }

  async function authorizedGet(account, resource, fields) {
    const revision = epoch;
    requireCondition(account, 'authRequired');
    requireCondition(youtube.configured, 'notConfigured');
    try {
      const token = await accessToken(account, revision);
      const result = await youtube
        .get(resource, fields, token)
        .catch(async (error) => {
          if (error.code !== 'authRequired' || epoch !== revision) throw error;
          if (access?.accessToken === token) access = null;
          return youtube.get(
            resource,
            fields,
            await accessToken(account, revision),
          );
        });
      requireCondition(epoch === revision, 'authRequired');
      return result;
    } catch (error) {
      if (epoch === revision && error.code === 'authRequired') forgetAccount();
      throw error;
    }
  }

  function sessionPairs(sessionId) {
    const pairs = readPairs().filter((pair) => pair.sessionId === sessionId);
    const account = pairs.some(({ channelId }) => channelId)
      ? readAccount()
      : null;
    return pairs
      .filter(
        (pair) => !pair.channelId || pair.channelId === account?.channelId,
      )
      .map((pair) => {
        const freshTwitch =
          pair.platform === 'twitch' &&
          Number.isFinite(pair.metadataCheckedAt) &&
          Date.now() - pair.metadataCheckedAt < TWITCH_METADATA_MAX_AGE;
        return {
          platform: pair.platform,
          videoId: pair.videoId,
          verified: Boolean(pair.channelId),
          ...(pair.channelId || freshTwitch ? metadataFields(pair) : {}),
          metadataStatus: freshTwitch ? pair.metadataStatus : 'unchecked',
        };
      });
  }

  async function candidates(startedAt) {
    const account = readAccount();
    const result = await authorizedGet(account, 'liveBroadcasts', {
      part: 'id,snippet,status',
      mine: 'true',
      maxResults: '50',
      broadcastType: 'all',
    });
    const start = Date.parse(startedAt ?? '');
    return (result.items ?? [])
      .filter(
        (item) =>
          VIDEO_ID.test(item.id) &&
          item.snippet?.channelId === account.channelId &&
          item.status?.lifeCycleStatus === 'complete',
      )
      .slice(0, 50)
      .map((item) => ({
        videoId: item.id,
        title: boundedVideoTitle(item.snippet.title),
        startedAt: Number.isFinite(Date.parse(item.snippet.actualStartTime))
          ? item.snippet.actualStartTime
          : null,
      }))
      .sort((a, b) =>
        Number.isFinite(start)
          ? (a.startedAt
              ? Math.abs(Date.parse(a.startedAt) - start)
              : Infinity) -
            (b.startedAt ? Math.abs(Date.parse(b.startedAt) - start) : Infinity)
          : Date.parse(b.startedAt ?? 0) - Date.parse(a.startedAt ?? 0),
      );
  }

  async function save(
    sessionId,
    platform,
    { url, candidateId },
    verifySession,
  ) {
    const revision = epoch;
    validatePlatform(platform);
    const fromCandidate =
      typeof candidateId === 'string' &&
      platform === 'youtube' &&
      VIDEO_ID.test(candidateId);
    const videoId = fromCandidate
      ? candidateId
      : parsePlatformVideo(platform, url);
    requireCondition(videoId, 'invalidVideo');
    const pair = { sessionId, platform, videoId };
    if (platform === 'twitch') {
      Object.assign(pair, await twitchMetadata(videoId));
    } else {
      const account = readAccount();
      if (fromCandidate) requireCondition(account, 'authRequired');
      if (account) {
        const result = await authorizedGet(account, 'videos', {
          part: 'id,snippet,contentDetails,liveStreamingDetails',
          id: videoId,
        });
        const video = result.items?.find((item) => item.id === videoId);
        requireCondition(video, 'unavailable');
        requireCondition(
          video.snippet?.channelId === account.channelId,
          'wrongChannel',
        );
        pair.channelId = account.channelId;
        const duration = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(
          video.contentDetails?.duration,
        );
        Object.assign(
          pair,
          metadataFields({
            title: video.snippet.title,
            channelName: video.snippet.channelTitle,
            videoDate: video.liveStreamingDetails?.actualStartTime,
            durationSeconds:
              duration &&
              Number(duration[1] ?? 0) * 3600 +
                Number(duration[2] ?? 0) * 60 +
                Number(duration[3] ?? 0),
          }),
        );
        pair.checkedAt = Date.now();
      }
    }
    verifySession();
    requireCondition(!pair.channelId || epoch === revision, 'authRequired');
    const other = readPairs().filter(
      (old) => old.sessionId !== sessionId || old.platform !== platform,
    );
    savePairs([...other, pair]);
    return sessionPairs(sessionId);
  }

  function remove(sessionId, platform) {
    validatePlatform(platform);
    const pairs = readPairs();
    const remaining = pairs.filter(
      (pair) => pair.sessionId !== sessionId || pair.platform !== platform,
    );
    if (remaining.length !== pairs.length) savePairs(remaining);
    return sessionPairs(sessionId);
  }

  async function twitchMetadata(videoId) {
    const metadata = await getTwitchVod(videoId);
    return {
      ...metadataFields(metadata.metadataStatus === 'ready' ? metadata : {}),
      metadataStatus: metadata.metadataStatus,
      metadataCheckedAt: Date.now(),
    };
  }

  async function refreshMetadata(sessionId, verifySession) {
    const original = readPairs().find(
      (pair) => pair.sessionId === sessionId && pair.platform === 'twitch',
    );
    requireCondition(original, 'invalidVideo');
    const metadata = await twitchMetadata(original.videoId);
    verifySession();
    const pairs = readPairs();
    const index = pairs.findIndex(
      (pair) =>
        pair.sessionId === sessionId &&
        pair.platform === 'twitch' &&
        pair.videoId === original.videoId,
    );
    if (index >= 0) {
      pairs[index] = { ...pairs[index], ...metadata };
      savePairs(pairs);
    }
    return sessionPairs(sessionId);
  }

  async function open(sessionId, platform) {
    validatePlatform(platform);
    const pair = sessionPairs(sessionId).find(
      (entry) => entry.platform === platform,
    );
    requireCondition(pair, 'invalidVideo');
    await openExternal(
      platform === 'youtube'
        ? `https://www.youtube.com/watch?v=${pair.videoId}`
        : `https://www.twitch.tv/videos/${pair.videoId}`,
    );
  }

  return {
    status,
    connect,
    cancel,
    disconnect,
    sessionPairs,
    candidates,
    save,
    remove,
    open,
    refreshMetadata,
  };
}

function metadataFields({ title, channelName, videoDate, durationSeconds }) {
  return {
    title: boundedVideoTitle(title),
    channelName: boundedText(channelName),
    videoDate:
      typeof videoDate === 'string' && Number.isFinite(Date.parse(videoDate))
        ? new Date(videoDate).toISOString()
        : null,
    durationSeconds:
      Number.isSafeInteger(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : null,
  };
}

module.exports = {
  createSessionPlatformVideos,
  parsePlatformVideo,
  SESSION_ID,
};
