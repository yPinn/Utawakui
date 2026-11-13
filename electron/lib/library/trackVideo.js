'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteExclusiveText } = require('../atomicWrite');
const { TRACKS_DIRNAME } = require('./constants');
const { resolveTrackAudioPath, resolveTrackDir } = require('./paths');

const VIDEO_MANIFEST = 'video.json';
const VIDEO_REVISION = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const VIDEO_FILENAME =
  /^video-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.mp4$/u;
const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const MAX_OFFSET_MS = 120_000;
const MAX_ALIGNMENT_SECONDS = 600;

function readVideoSegments(value, duration) {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 8 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return null;
  const segments = [];
  for (const item of value) {
    const { startMs, endMs, offsetMs } = item ?? {};
    if (
      ![startMs, endMs, offsetMs].every(Number.isSafeInteger) ||
      startMs < 0 ||
      endMs <= startMs ||
      endMs > MAX_ALIGNMENT_SECONDS * 1000 ||
      Math.abs(offsetMs) > MAX_OFFSET_MS ||
      startMs + offsetMs < 0 ||
      endMs + offsetMs > duration * 1000 + 20
    )
      return null;
    const previous = segments.at(-1);
    if (
      previous &&
      (startMs < previous.endMs ||
        startMs + offsetMs < previous.endMs + previous.offsetMs)
    )
      return null;
    segments.push({ startMs, endMs, offsetMs });
  }
  return segments;
}

// Stored offsets stay equal to what playback applies: the first segment
// follows the base offset. Returns null when a shifted segment no longer fits.
function shiftVideoSegments(segments, offsetMs, duration) {
  const delta = offsetMs - segments[0].offsetMs;
  return readVideoSegments(
    segments.map((segment) => ({
      ...segment,
      offsetMs: segment.offsetMs + delta,
    })),
    duration,
  );
}

function fileStat(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  return stat?.isFile() ? stat : null;
}

function trackVideoSource(dir, trackId) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (
    !trackDir ||
    !fs.lstatSync(trackDir, { throwIfNoEntry: false })?.isDirectory()
  )
    return null;
  const audioPath = resolveTrackAudioPath(dir, trackId);
  const audio = audioPath && fileStat(audioPath);
  if (!audio) return null;
  return {
    trackDir,
    audioPath,
    binding: `${path.basename(audioPath)}:${audio.size}:${audio.mtimeMs}`,
  };
}

function readTrackVideo(source) {
  const manifest = path.join(source.trackDir, VIDEO_MANIFEST);
  const stat = fileStat(manifest);
  if (!stat || stat.size > 4096) return null;
  try {
    const value = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return value?.version === 1 &&
      typeof value.revision === 'string' &&
      VIDEO_REVISION.test(value.revision)
      ? value
      : null;
  } catch {
    return null;
  }
}

function writeTrackVideo(trackDir, manifest) {
  atomicWriteExclusiveText(
    path.join(trackDir, VIDEO_MANIFEST),
    JSON.stringify(manifest, null, 2),
  );
}

function videoPath(trackDir, revision) {
  return path.join(trackDir, `video-${revision}.mp4`);
}

function cleanupTrackVideos(dir, { protectedTrackIds, onError } = {}) {
  const result = { removedCount: 0, skippedCount: 0, freedBytes: 0 };
  const tracksRoot = path.join(dir, TRACKS_DIRNAME);
  if (!fs.lstatSync(tracksRoot, { throwIfNoEntry: false })?.isDirectory())
    return result;

  const protectedIds = new Set(protectedTrackIds);
  for (const entry of fs.readdirSync(tracksRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const trackDir = resolveTrackDir(dir, entry.name);
    if (!trackDir || protectedIds.has(entry.name)) continue;
    try {
      const saved = readTrackVideo({ trackDir });
      if (!saved) continue;
      const file = videoPath(trackDir, saved.revision);
      const stat = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!stat) continue;
      if (!stat.isFile()) {
        result.skippedCount += 1;
        continue;
      }
      // A locked MP4 must keep its manifest so the user can retry the removal.
      fs.unlinkSync(file);
      result.removedCount += 1;
      result.freedBytes += stat.size;
    } catch (error) {
      result.skippedCount += 1;
      onError?.(error);
      continue;
    }
    // The MP4 is gone; a stale manifest only reads as unavailable.
    try {
      fs.unlinkSync(path.join(trackDir, VIDEO_MANIFEST));
    } catch (error) {
      onError?.(error);
    }
  }
  return result;
}

function resolveTrackVideoPath(dir, trackId, revision) {
  if (!VIDEO_REVISION.test(revision)) return null;
  const source = trackVideoSource(dir, trackId);
  const saved = source && readTrackVideo(source);
  if (!saved || saved.revision !== revision || saved.binding !== source.binding)
    return null;
  const file = videoPath(source.trackDir, revision);
  return fileStat(file) ? file : null;
}

module.exports = {
  cleanupTrackVideos,
  fileStat,
  MAX_ALIGNMENT_SECONDS,
  MAX_OFFSET_MS,
  MAX_VIDEO_BYTES,
  readTrackVideo,
  readVideoSegments,
  resolveTrackVideoPath,
  shiftVideoSegments,
  trackVideoSource,
  videoPath,
  VIDEO_MANIFEST,
  VIDEO_FILENAME,
  VIDEO_REVISION,
  writeTrackVideo,
};
