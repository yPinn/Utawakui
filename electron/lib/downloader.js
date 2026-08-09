'use strict';

const fs = require('fs');
const path = require('path');
const youtubedl = require('youtube-dl-exec');

// Shared by downloadAudio (reads a yt-dlp .info.json sidecar) and
// fetchMetadata (reads yt-dlp's --dump-single-json object directly) — same
// yt-dlp info shape either way, so the field-extraction rules must match.
function extractMetadataFields(info) {
  const title = typeof info.title === 'string' ? info.title : undefined;
  // info.artist only exists for videos yt-dlp recognized as music (e.g.
  // YT Music sources) — a plain YouTube upload falls back to the channel
  // name, which beats showing nothing.
  const artist =
    typeof info.artist === 'string'
      ? info.artist
      : typeof info.uploader === 'string'
        ? info.uploader
        : undefined;
  const duration =
    typeof info.duration === 'number' ? info.duration : undefined;
  return { title, artist, duration };
}

async function downloadAudio(videoId, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  const outputTemplate = path.join(destDir, '%(id)s.%(ext)s');
  const infoJsonPath = path.join(destDir, `${videoId}.info.json`);

  await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio',
    output: outputTemplate,
    noPlaylist: true,
    writeInfoJson: true,
  });

  const match = fs
    .readdirSync(destDir)
    .find(
      (name) =>
        name.startsWith(`${videoId}.`) && name !== `${videoId}.info.json`,
    );

  if (!match) {
    throw new Error(
      `yt-dlp reported success but no output file found for ${videoId}`,
    );
  }

  // Best-effort metadata extraction — a missing/corrupt info.json shouldn't
  // fail a download that otherwise succeeded, just leave these undefined
  // (library.js's listTracks falls back to the id / omits the field).
  let fields = {};
  try {
    const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
    fields = extractMetadataFields(info);
  } catch {
    // ignore
  } finally {
    try {
      fs.unlinkSync(infoJsonPath);
    } catch {
      // ignore — not in AUDIO_EXTENSIONS, listTracks() would skip it anyway
    }
  }

  return { filePath: path.join(destDir, match), ...fields };
}

// Metadata-only lookup for library.js's runBackfillPass. Returns null on
// any failure — callers treat that as "couldn't backfill this time", not
// an exceptional error.
async function fetchMetadata(videoId) {
  let info;
  try {
    info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      skipDownload: true,
      dumpSingleJson: true,
      quiet: true,
      noWarnings: true,
      noPlaylist: true,
    });
  } catch {
    return null;
  }

  if (typeof info !== 'object' || info === null) return null;
  return extractMetadataFields(info);
}

// --flat-playlist resolves fast (skips full per-video extraction) but still
// carries title/duration/uploader per entry (verified against a real
// uploads playlist). Unlike fetchMetadata, failures throw — this is a
// user-initiated action that should surface an error, not retry silently.
async function listPlaylist(playlistId) {
  const info = await youtubedl(
    `https://www.youtube.com/playlist?list=${playlistId}`,
    {
      flatPlaylist: true,
      dumpSingleJson: true,
      quiet: true,
      noWarnings: true,
    },
  );

  const entries = Array.isArray(info.entries) ? info.entries : [];
  return entries
    .filter((entry) => typeof entry.id === 'string')
    .map((entry) => ({ id: entry.id, ...extractMetadataFields(entry) }));
}

module.exports = {
  downloadAudio,
  fetchMetadata,
  extractMetadataFields,
  listPlaylist,
};
