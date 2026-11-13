'use strict';

const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { isBoundedTrackId } = require('../lib/library/paths');
const {
  cleanupTrackVideos,
  fileStat,
  MAX_ALIGNMENT_SECONDS,
  MAX_OFFSET_MS,
  MAX_VIDEO_BYTES,
  readTrackVideo,
  readVideoSegments,
  resolveTrackVideoPath,
  trackVideoSource,
  videoPath,
  VIDEO_MANIFEST,
  VIDEO_REVISION,
  writeTrackVideo,
} = require('../lib/library/trackVideo');
const {
  planVideoFormats,
  planVideoReference,
} = require('../lib/trackVideoFormats');
const { VIDEO_ID_RE, extractVideoId } = require('../lib/youtube');
const { classifyPlaybackKind } = require('../lib/importResolver');
const {
  createTrackVideoAlignment,
  problem,
  readAlignment,
  progressPrefix,
  validateOffset,
} = require('./trackVideoAlignment');
const { watchUrl } = require('../lib/youtubeAttempts');

const exec = promisify(execFile);
const fixtureHeights = [720, 1080, 1440];

function sourceKind(data) {
  const kind = classifyPlaybackKind({
    title: data?.title,
    uploader: data?.channel || data?.uploader,
  });
  if (kind === 'youtube-official-mv') return 'mv';
  if (kind === 'youtube-lyric-video') return 'lyrics';
  if (kind === 'youtube-topic-audio' || kind === 'youtube-official-audio')
    return 'audio';
  if (kind === 'youtube-live' || kind === 'youtube-variant') return 'variant';
  return 'unknown';
}

function recordedSource(context) {
  const info = path.join(context.trackDir, 'info.json');
  try {
    const stat = fileStat(info);
    if (!stat || stat.size > 8 * 1024 ** 2) return null;
    const data = JSON.parse(fs.readFileSync(info, 'utf8'));
    const id =
      extractVideoId(data?.webpage_url) ??
      (String(data?.extractor_key ?? data?.extractor).toLowerCase() ===
      'youtube'
        ? data.id
        : null);
    if (typeof id !== 'string' || !VIDEO_ID_RE.test(id)) return null;
    return {
      id,
      kind: sourceKind(data),
      title: String(data.title || '').slice(0, 200),
    };
  } catch {
    return null;
  }
}

async function inspectTrackVideo(filePath, ffmpeg, signal) {
  const sizeBytes = (await fsp.lstat(filePath)).size;
  if (sizeBytes > MAX_VIDEO_BYTES) throw problem('space');
  const { stderr } = await exec(
    ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-xerror',
      '-protocol_whitelist',
      'file',
      '-f',
      'mov',
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-an',
      '-frames:v',
      '1',
      '-f',
      'null',
      '-',
    ],
    { windowsHide: true, timeout: 20_000, signal, maxBuffer: 256 * 1024 },
  );
  const streams = stderr.split('Stream mapping:')[0];
  const stream = streams
    .split(/\r?\n/u)
    .find((line) => /Video: h264\b/u.test(line));
  const dimensions = stream?.match(/\b(\d{2,5})x(\d{2,5})\b/u);
  const time = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/u);
  const duration = time && +time[1] * 3600 + +time[2] * 60 + +time[3];
  if (!dimensions || !duration || /smpte2084|arib-std-b67/u.test(stream))
    throw problem('invalid-video');
  return {
    width: +dimensions[1],
    height: +dimensions[2],
    duration,
    sizeBytes,
    hasAudio: /Stream #\d+:\d+[^\r\n]*:\s*Audio:/u.test(streams),
  };
}

function registerTrackVideoHandlers({
  ipcMain,
  dialog,
  getMainWindow,
  getScope,
  getFfmpeg,
  getProviderRunner,
  requireProvider,
  recordDiagnostic,
  onChange,
  openExternal,
  fixture = null,
  inspectVideo = inspectTrackVideo,
  estimateAlignment,
}) {
  let offer;
  let draft;
  let job;
  const aligner = createTrackVideoAlignment({
    getContext,
    stillCurrent,
    savedView,
    requireProvider,
    cleanup,
    recordDiagnostic,
    onChange,
    getFfmpeg,
    getProviderRunner,
    inspectVideo,
    estimateAlignment,
    jobs: {
      get: () => job,
      set: (value) => {
        job = value;
      },
    },
  });

  function getContext(trackId) {
    const { dir, epoch } = getScope();
    const source = trackVideoSource(dir, trackId);
    if (!source) throw problem('unavailable');
    return { trackId, dir, epoch, ...source };
  }

  function stillCurrent(context) {
    const next = getContext(context.trackId);
    return (
      context.dir === next.dir &&
      context.epoch === next.epoch &&
      context.binding === next.binding
    );
  }

  function cleanup(file, recursive = false) {
    try {
      fs.rmSync(file, {
        recursive,
        force: true,
        maxRetries: 2,
        retryDelay: 50,
      });
    } catch (error) {
      recordDiagnostic?.({
        process: 'main',
        level: 'warning',
        source: 'track-video',
        operation: 'cleanup',
        code: 'TRACK_VIDEO_CLEANUP_FAILED',
        error,
      });
    }
  }

  function clearDraft() {
    const item = draft;
    draft = null;
    // Only mkdtemp creates a stage under a validated track directory.
    if (item?.stage) cleanup(item.stage, true);
  }

  function savedView(context) {
    const saved = readTrackVideo(context);
    if (!saved) return null;
    const active = resolveTrackVideoPath(
      context.dir,
      context.trackId,
      saved.revision,
    );
    const segments = readVideoSegments(saved.syncSegments, saved.duration);
    return {
      available: Boolean(active),
      revision: saved.revision,
      ...(segments && { syncSegments: segments }),
      width: Number(saved.width) || 0,
      height: Number(saved.height) || 0,
      duration: Number(saved.duration) || 0,
      sizeBytes: Number(saved.sizeBytes) || 0,
      offsetMs: Math.max(
        -MAX_OFFSET_MS,
        Math.min(MAX_OFFSET_MS, Number(saved.offsetMs) || 0),
      ),
      url: active
        ? `utawakui-media://track-video/${encodeURIComponent(context.trackId)}/${saved.revision}`
        : null,
    };
  }

  function publishVideo(item, offsetMs, useSegments) {
    const { context, token } = item;
    const old = readTrackVideo(context);
    const destination = videoPath(context.trackDir, token);
    fs.renameSync(item.filePath, destination);
    try {
      writeTrackVideo(context.trackDir, {
        version: 1,
        revision: token,
        binding: context.binding,
        offsetMs,
        ...item.metadata,
        ...(item.sourceVideoId && { sourceVideoId: item.sourceVideoId }),
        ...(item.syncSegments &&
          useSegments !== false && { syncSegments: item.syncSegments }),
      });
    } catch (error) {
      fs.renameSync(destination, item.filePath);
      throw error;
    }
    if (draft === item) draft = null;
    cleanup(item.stage, true);
    if (old) cleanup(videoPath(context.trackDir, old.revision));
    onChange?.(context.trackId);
    return { status: 'ok', video: savedView(context) };
  }

  async function acquire(context, kind, take, reserved = null) {
    if (job && job !== reserved) throw problem('busy');
    const controller = reserved?.controller ?? new AbortController();
    const token = randomUUID();
    const current = reserved ?? { context, kind, controller, progress: null };
    job = current;
    let stage;
    try {
      if (!stillCurrent(context)) throw problem('stale');
      const ffmpeg = getFfmpeg();
      current.kind = kind;
      clearDraft();
      stage = await fsp.mkdtemp(path.join(context.trackDir, '.video-stage-'));
      const filePath = path.join(stage, 'video.mp4');
      const getReference = await take(filePath, controller.signal, current);
      controller.signal.throwIfAborted();
      if (!fileStat(filePath)) throw problem('invalid-video');
      current.kind = 'validating';
      let inspected;
      try {
        inspected = await inspectVideo(filePath, ffmpeg, controller.signal);
      } catch (error) {
        if (controller.signal.aborted || error.code === 'space') throw error;
        throw problem('invalid-video');
      }
      const { hasAudio, ...metadata } = inspected;
      if (
        current.expectedHeight &&
        metadata.height !== current.expectedHeight
      ) {
        throw problem('invalid-video');
      }
      let alignment;
      let reason = current.sourceVideoId
        ? 'reference-unavailable'
        : 'missing-reference';
      if (metadata.duration > MAX_ALIGNMENT_SECONDS) reason = 'duration-limit';
      else if (hasAudio || getReference) {
        current.kind = 'aligning';
        current.progress = null;
        ({ alignment, reason } = await aligner.suggest(
          context,
          filePath,
          ffmpeg,
          hasAudio,
          getReference,
          controller.signal,
        ));
      }
      controller.signal.throwIfAborted();
      if (!stillCurrent(context)) throw problem('stale');
      const suggestion = readAlignment(alignment, metadata.duration);
      const item = {
        context,
        token,
        stage,
        filePath,
        metadata,
        sourceVideoId: current.sourceVideoId,
        syncSegments: suggestion?.segments ?? null,
      };
      if (suggestion?.autoApply) {
        if (current.sourceVideoId) requireProvider();
        return publishVideo(item, suggestion.offsetMs, true);
      }
      draft = item;
      const reviewRange = suggestion?.reviewRange;
      return {
        status: 'candidate',
        token,
        ...metadata,
        reason: reviewRange
          ? 'partial-offset'
          : suggestion
            ? 'partial-match'
            : (reason ?? 'insufficient-match'),
        suggestedOffsetMs: suggestion?.offsetMs ?? null,
        ...(reviewRange && { reviewRange }),
        ...(item.syncSegments && { segmentCount: item.syncSegments.length }),
        url: `utawakui-media://video-candidate/${encodeURIComponent(context.trackId)}/${token}`,
      };
    } catch (error) {
      if (stage) cleanup(stage, true);
      if (
        controller.signal.aborted &&
        !['space', 'stale'].includes(error.code)
      ) {
        throw controller.signal.reason?.code
          ? controller.signal.reason
          : problem('cancelled');
      }
      throw error;
    } finally {
      if (job === current) job = null;
    }
  }

  const handlers = {
    get({ trackId, includeSource }) {
      const context = getContext(trackId);
      return {
        status: 'ok',
        video: savedView(context),
        ...(includeSource === true && { source: recordedSource(context) }),
        fixture: Boolean(fixture),
      };
    },
    async preview({ trackId, videoId }) {
      if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId))
        throw problem('invalid-intent');
      getContext(trackId);
      await openExternal(watchUrl(videoId));
      return { status: 'ok' };
    },
    async pick({ trackId }, window) {
      if (job) throw problem('busy');
      const context = getContext(trackId);
      const reserved = {
        context,
        kind: 'choosing',
        controller: new AbortController(),
        progress: null,
      };
      job = reserved;
      try {
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [{ name: 'MP4', extensions: ['mp4'] }],
        });
        if (
          result.canceled ||
          !result.filePaths[0] ||
          reserved.controller.signal.aborted
        )
          return { status: 'cancelled' };
        return await acquire(
          context,
          'importing',
          async (file) => {
            const input = result.filePaths[0];
            const stat = await fsp.stat(input);
            if (!stat.isFile() || stat.size > MAX_VIDEO_BYTES)
              throw problem('space');
            await checkSpace(context.trackDir, stat.size);
            await fsp.copyFile(input, file, fs.constants.COPYFILE_EXCL);
          },
          reserved,
        );
      } finally {
        if (job === reserved) job = null;
      }
    },
    async formats({ trackId, videoId }) {
      const context = getContext(trackId);
      if (job) throw problem('busy');
      if (
        typeof videoId !== 'string' ||
        (!VIDEO_ID_RE.test(videoId) && !(fixture && videoId === 'fixture'))
      ) {
        throw problem('invalid-intent');
      }
      const isFixture = videoId === 'fixture';
      if (!isFixture) requireProvider();
      const controller = new AbortController();
      const current = { context, kind: 'checking', controller, progress: null };
      job = current;
      offer = null;
      try {
        const target = watchUrl(videoId);
        const run = isFixture ? fixture.run : await getProviderRunner();
        const data = isFixture
          ? {
              title: '720p / 1080p / 1440p',
              formats: fixtureHeights.map((height) => ({
                format_id: String(height),
                height,
                ext: 'mp4',
                vcodec: 'h264',
                acodec: 'none',
              })),
            }
          : await run(
              target,
              { dumpSingleJson: true, skipDownload: true, noPlaylist: true },
              { signal: controller.signal, waitForExitOnAbort: true },
            );
        if (controller.signal.aborted) throw problem('cancelled');
        if (!stillCurrent(context)) throw problem('stale');
        const formats = Array.isArray(data?.formats) ? data.formats : [];
        const plan = planVideoFormats(formats);
        const token = plan.choices.length ? randomUUID() : null;
        if (token)
          offer = {
            token,
            context,
            target,
            isFixture,
            videoId: isFixture ? null : videoId,
            choices: plan.choices,
            reference: planVideoReference(formats),
            expires: Date.now() + 15 * 60_000,
          };
        return {
          status: 'ok',
          token,
          title: String(data?.title || '').slice(0, 200),
          kind: isFixture ? 'unknown' : sourceKind(data),
          fixture: isFixture,
          ...plan,
        };
      } finally {
        if (job === current) job = null;
      }
    },
    async download({ trackId, token, formatId, permitted }) {
      const chosen = offer;
      if (
        chosen?.token !== token ||
        chosen.context.trackId !== trackId ||
        Date.now() > chosen.expires ||
        !stillCurrent(chosen.context)
      )
        throw problem('stale');
      const choice = chosen.choices.find(({ id }) => id === formatId);
      if (!choice || (!chosen.isFixture && permitted !== true))
        throw problem('invalid-intent');
      if (!chosen.isFixture) requireProvider();
      return acquire(
        chosen.context,
        'download',
        async (file, signal, current) => {
          current.expectedHeight = choice.height;
          current.sourceVideoId = chosen.videoId;
          await checkSpace(chosen.context.trackDir, choice.sizeBytes);
          const run = chosen.isFixture
            ? fixture.run
            : await getProviderRunner();
          const target = chosen.isFixture
            ? `http://127.0.0.1:${fixture.port}/${choice.height}.mp4`
            : chosen.target;
          await run(
            target,
            {
              noPlaylist: true,
              noContinue: true,
              newline: true,
              output: file,
              maxFilesize: MAX_VIDEO_BYTES,
              ...(!chosen.isFixture && { format: choice.id }),
              progressTemplate: `download:${progressPrefix}%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s`,
            },
            {
              signal,
              waitForExitOnAbort: true,
              onStdoutLine(line) {
                if (!line.startsWith(progressPrefix)) return;
                const [received, total, estimate] = line
                  .slice(progressPrefix.length)
                  .split(/\s+/u)
                  .map(Number);
                if (!Number.isSafeInteger(received) || received < 0) return;
                if (received > MAX_VIDEO_BYTES)
                  current.controller.abort(problem('space'));
                const length = total || estimate || choice.sizeBytes;
                current.progress =
                  length > 0 ? Math.min(100, (received / length) * 100) : null;
              },
            },
          );
          if (!chosen.isFixture) requireProvider();
          return chosen.reference
            ? () =>
                aligner.fetchReference(run, chosen, path.dirname(file), signal)
            : null;
        },
      );
    },
    status({ trackId }) {
      return job?.context.trackId === trackId
        ? { status: job.kind, progress: job.progress }
        : { status: 'idle' };
    },
    cancel({ trackId }) {
      if (job?.context.trackId === trackId)
        job.controller.abort(problem('cancelled'));
      if (draft?.context.trackId === trackId) clearDraft();
      return { status: 'ok' };
    },
    save({ trackId, token, offsetMs, useSegments }) {
      const item = draft;
      validateOffset(offsetMs);
      if (useSegments !== undefined && typeof useSegments !== 'boolean')
        throw problem('invalid-intent');
      if (
        !item ||
        item.token !== token ||
        item.context.trackId !== trackId ||
        !stillCurrent(item.context)
      )
        throw problem('stale');
      return publishVideo(item, offsetMs, useSegments);
    },
    align: (input) => aligner.align(input),
    'set-offset': (input) => aligner.setOffset(input),
    remove({ trackId }) {
      if (job?.context.trackId === trackId) throw problem('busy');
      const context = getContext(trackId);
      const old = readTrackVideo(context);
      if (old) {
        fs.rmSync(path.join(context.trackDir, VIDEO_MANIFEST));
        cleanup(videoPath(context.trackDir, old.revision));
        onChange?.(trackId);
      }
      return { status: 'ok', video: null };
    },
  };

  const publicStatuses = new Set([
    'busy',
    'cancelled',
    'invalid-intent',
    'invalid-video',
    'no-formats',
    'space',
    'stale',
    'unavailable',
  ]);
  for (const [operation, handler] of Object.entries(handlers)) {
    ipcMain.handle(`track-video:${operation}`, async (event, input) => {
      const window = getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        !isBoundedTrackId(input?.trackId)
      )
        return { status: 'invalid-intent' };
      try {
        return await handler(input, window);
      } catch (error) {
        if (
          error.name === 'AbortError' ||
          error.code === 'IMPORT_DOWNLOAD_CANCELLED'
        )
          return { status: 'cancelled' };
        if (error.code === 'FEATURE_GATE_REQUIRED')
          return { status: 'provider-disabled' };
        if (publicStatuses.has(error.code)) return { status: error.code };
        if (error.code === 'ENOSPC') return { status: 'space' };
        if (error.code === 'FEATURE_DEPENDENCY_MISSING')
          return { status: 'ffmpeg' };
        recordDiagnostic?.({
          process: 'main',
          level: 'warning',
          source: 'track-video',
          operation,
          code: 'TRACK_VIDEO_FAILED',
          error,
        });
        return { status: 'unavailable' };
      }
    });
  }

  return {
    cleanupLibraryVideos() {
      const { dir, epoch } = getScope();
      const protectedTrackIds = [job?.context, draft?.context]
        .filter((context) => context?.dir === dir && context.epoch === epoch)
        .map(({ trackId }) => trackId);
      const result = cleanupTrackVideos(dir, {
        protectedTrackIds,
        onError(error) {
          try {
            recordDiagnostic?.({
              process: 'main',
              level: 'warning',
              source: 'track-video',
              operation: 'cleanup-library-videos',
              code: 'TRACK_VIDEO_CLEANUP_FAILED',
              error,
            });
          } catch {
            // Continue cleaning other tracks if diagnostics are unavailable.
          }
        },
      });
      if (result.removedCount > 0) onChange?.(null);
      return result;
    },
    resolveCandidate(dir, trackId, token) {
      const item = draft;
      return item &&
        item.context.dir === dir &&
        item.context.trackId === trackId &&
        item.token === token &&
        VIDEO_REVISION.test(token) &&
        fileStat(item.filePath)
        ? item.filePath
        : null;
    },
    invalidate() {
      offer = null;
      aligner.invalidate();
      job?.controller.abort(problem('stale'));
      clearDraft();
    },
  };
}

async function checkSpace(directory, expected) {
  if (expected > MAX_VIDEO_BYTES) throw problem('space');
  const { bavail, bsize } = await fsp.statfs(directory);
  if (expected && expected > bavail * bsize) throw problem('space');
}

module.exports = { inspectTrackVideo, registerTrackVideoHandlers };
