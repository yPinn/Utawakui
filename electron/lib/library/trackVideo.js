'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveTrackAudioPath, resolveTrackDir } = require('./paths');

const VIDEO_MANIFEST = 'video.json';
const VIDEO_REVISION = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const VIDEO_FILENAME =
  /^video-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.mp4$/u;
const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const MAX_OFFSET_MS = 120_000;

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
    binding: `${path.basename(audioPath)}:${audio.size}:${audio.mtimeMs}`,
  };
}

function readTrackVideo(source) {
  const manifest = path.join(source.trackDir, VIDEO_MANIFEST);
  const stat = fileStat(manifest);
  if (!stat || stat.size > 4096) return null;
  try {
    const value = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return value?.version === 1 && VIDEO_REVISION.test(value.revision)
      ? value
      : null;
  } catch {
    return null;
  }
}

function videoPath(trackDir, revision) {
  return path.join(trackDir, `video-${revision}.mp4`);
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
  fileStat,
  MAX_OFFSET_MS,
  MAX_VIDEO_BYTES,
  readTrackVideo,
  resolveTrackVideoPath,
  trackVideoSource,
  videoPath,
  VIDEO_MANIFEST,
  VIDEO_FILENAME,
  VIDEO_REVISION,
};
