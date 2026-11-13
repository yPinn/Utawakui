'use strict';

// Offset suggestions for track videos: a bounded reference audio download,
// the FFT estimate, and re-estimating or adjusting a saved video.
const { randomUUID } = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  fileStat,
  MAX_ALIGNMENT_SECONDS,
  MAX_OFFSET_MS,
  readTrackVideo,
  readVideoSegments,
  resolveTrackVideoPath,
  videoPath,
  VIDEO_REVISION,
  writeTrackVideo,
} = require('../lib/library/trackVideo');
const {
  MAX_VIDEO_REFERENCE_BYTES,
  planVideoReference,
} = require('../lib/trackVideoFormats');
const { estimateTrackVideoAlignment } = require('../lib/trackVideoSync');
const { VIDEO_ID_RE } = require('../lib/youtube');
const { watchUrl } = require('../lib/youtubeAttempts');

const progressPrefix = 'UTAWAKUI_MV ';

function problem(code) {
  return Object.assign(new Error(code), { code });
}

function isValidOffset(offsetMs) {
  return Number.isSafeInteger(offsetMs) && Math.abs(offsetMs) <= MAX_OFFSET_MS;
}

function validateOffset(offsetMs) {
  if (!isValidOffset(offsetMs)) throw problem('invalid-intent');
}

// A suggestion counts only with a valid offset and, when given, valid segments.
function readAlignment(alignment, duration) {
  if (!isValidOffset(alignment?.offsetMs)) return null;
  const segments = readVideoSegments(alignment.segments, duration);
  if (alignment.segments && !segments) return null;
  return {
    offsetMs: alignment.offsetMs,
    segments,
    reviewRange: alignment.reviewRange ?? null,
    autoApply: alignment.autoApply === true,
  };
}

// `jobs` shares the handlers' single active job, so alignment and
// acquisition never run at once.
function createTrackVideoAlignment({
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
  estimateAlignment = estimateTrackVideoAlignment,
  jobs,
}) {
  let pending = null;

  async function suggest(
    context,
    filePath,
    ffmpeg,
    hasAudio,
    getReference,
    signal,
  ) {
    let referencePath;
    try {
      referencePath = hasAudio ? filePath : await getReference?.();
      if (!referencePath) return { reason: 'reference-unavailable' };
      const alignment = await estimateAlignment({
        ffmpeg,
        audioPath: context.audioPath,
        referencePath,
        signal,
      });
      return alignment ? { alignment } : { reason: 'insufficient-match' };
    } catch (error) {
      signal.throwIfAborted();
      if (error.code === 'FEATURE_GATE_REQUIRED') throw error;
      recordDiagnostic?.({
        process: 'main',
        level: 'warning',
        source: 'track-video',
        operation: 'align',
        code: 'TRACK_VIDEO_ALIGNMENT_FAILED',
        error,
      });
      return {
        reason: referencePath
          ? 'analysis-unavailable'
          : 'reference-unavailable',
      };
    } finally {
      if (referencePath && referencePath !== filePath) cleanup(referencePath);
    }
  }

  async function fetchReference(run, chosen, directory, signal) {
    const { id, ext } = chosen.reference;
    const output = path.join(directory, `reference.${ext}`);
    const limit = new AbortController();
    try {
      requireProvider();
      await run(
        chosen.target,
        {
          noPlaylist: true,
          noContinue: true,
          newline: true,
          output,
          format: id,
          maxFilesize: MAX_VIDEO_REFERENCE_BYTES,
          progressTemplate: `download:${progressPrefix}%(progress.downloaded_bytes)s`,
        },
        {
          signal: AbortSignal.any([
            signal,
            limit.signal,
            AbortSignal.timeout(20_000),
          ]),
          waitForExitOnAbort: true,
          onStdoutLine(line) {
            if (
              line.startsWith(progressPrefix) &&
              Number(line.slice(progressPrefix.length)) >
                MAX_VIDEO_REFERENCE_BYTES
            )
              limit.abort(problem('space'));
          },
        },
      );
      requireProvider();
      const stat = fileStat(output);
      if (stat && stat.size > 0 && stat.size <= MAX_VIDEO_REFERENCE_BYTES)
        return output;
    } catch (error) {
      cleanup(output);
      throw error;
    } finally {
      cleanup(`${output}.part`);
    }
    cleanup(output);
    return null;
  }

  async function align({ trackId, revision, videoId }) {
    if (
      typeof revision !== 'string' ||
      !VIDEO_REVISION.test(revision) ||
      (videoId != null &&
        (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)))
    )
      throw problem('invalid-intent');
    if (jobs.get()) throw problem('busy');
    const context = getContext(trackId);
    const filePath = resolveTrackVideoPath(context.dir, trackId, revision);
    if (!filePath) throw problem('stale');
    const original = fileStat(filePath);
    if (!original) throw problem('stale');
    const saved = readTrackVideo(context);
    const linked = saved?.sourceVideoId;
    const referenceId =
      videoId ??
      (typeof linked === 'string' && VIDEO_ID_RE.test(linked) ? linked : null);
    const controller = new AbortController();
    const { signal } = controller;
    jobs.set({ context, kind: 'aligning', controller, progress: null });
    let stage;
    try {
      const ffmpeg = getFfmpeg();
      const { hasAudio, duration } = await inspectVideo(
        filePath,
        ffmpeg,
        signal,
      );
      const getReference =
        referenceId &&
        (async () => {
          requireProvider();
          const target = watchUrl(referenceId);
          const run = await getProviderRunner();
          const data = await run(
            target,
            {
              dumpSingleJson: true,
              skipDownload: true,
              noPlaylist: true,
            },
            {
              signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
              waitForExitOnAbort: true,
            },
          );
          const reference = planVideoReference(
            Array.isArray(data?.formats) ? data.formats : [],
          );
          if (!reference) return null;
          signal.throwIfAborted();
          stage = await fsp.mkdtemp(
            path.join(context.trackDir, '.video-sync-'),
          );
          return fetchReference(run, { target, reference }, stage, signal);
        });
      const { alignment } =
        duration <= MAX_ALIGNMENT_SECONDS
          ? await suggest(
              context,
              filePath,
              ffmpeg,
              hasAudio,
              getReference,
              signal,
            )
          : {};
      signal.throwIfAborted();
      const current = fileStat(filePath);
      if (
        !stillCurrent(context) ||
        readTrackVideo(context)?.revision !== revision ||
        current?.mtimeMs !== original.mtimeMs ||
        current?.size !== original.size
      )
        throw problem('stale');
      const suggestion = readAlignment(alignment, duration);
      const segments = suggestion?.segments;
      const alignmentToken = segments ? randomUUID() : null;
      if (segments)
        pending = {
          context,
          revision,
          segments,
          original,
          token: alignmentToken,
          expires: Date.now() + 10 * 60_000,
        };
      return {
        status: 'ok',
        suggestedOffsetMs: suggestion?.offsetMs ?? null,
        ...(suggestion?.reviewRange && { reviewRange: suggestion.reviewRange }),
        ...(segments && { alignmentToken, segmentCount: segments.length }),
        needsReference:
          duration <= MAX_ALIGNMENT_SECONDS && !hasAudio && !referenceId,
      };
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    } finally {
      if (stage) cleanup(stage, true);
      jobs.set(null);
    }
  }

  function setOffset({
    trackId,
    revision,
    offsetMs,
    alignmentToken,
    useSegments,
  }) {
    validateOffset(offsetMs);
    if (
      typeof revision !== 'string' ||
      !VIDEO_REVISION.test(revision) ||
      (alignmentToken != null &&
        (typeof alignmentToken !== 'string' ||
          !VIDEO_REVISION.test(alignmentToken))) ||
      (useSegments !== undefined && typeof useSegments !== 'boolean')
    )
      throw problem('invalid-intent');
    const context = getContext(trackId);
    const saved = readTrackVideo(context);
    const file = fileStat(videoPath(context.trackDir, revision));
    if (
      saved?.revision !== revision ||
      saved.binding !== context.binding ||
      !file
    )
      throw problem('stale');
    let segments =
      useSegments === false
        ? null
        : readVideoSegments(saved.syncSegments, saved.duration);
    if (alignmentToken) {
      const offer = pending;
      if (
        offer?.token !== alignmentToken ||
        offer.revision !== revision ||
        offer.context.trackId !== trackId ||
        !stillCurrent(offer.context) ||
        Date.now() > offer.expires ||
        file.mtimeMs !== offer.original.mtimeMs ||
        file.size !== offer.original.size
      )
        throw problem('stale');
      segments = useSegments === false ? null : offer.segments;
    }
    if (
      saved.offsetMs !== offsetMs ||
      alignmentToken ||
      (useSegments === false && saved.syncSegments)
    ) {
      const next = { ...saved, offsetMs };
      if (segments) next.syncSegments = segments;
      else delete next.syncSegments;
      writeTrackVideo(context.trackDir, next);
      if (alignmentToken) pending = null;
      onChange?.(trackId);
    }
    return { status: 'ok', video: savedView(context) };
  }

  return {
    suggest,
    fetchReference,
    align,
    setOffset,
    invalidate() {
      pending = null;
    },
  };
}

module.exports = {
  createTrackVideoAlignment,
  problem,
  readAlignment,
  progressPrefix,
  validateOffset,
};
