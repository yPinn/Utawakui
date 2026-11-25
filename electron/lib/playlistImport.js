'use strict';

const { open } = require('node:fs/promises');
const path = require('node:path');
const { isBoundedTrackId } = require('./library/paths');
const { buildObservedTrack } = require('./musicIdentity/observedTrack');
const {
  compareRecordingIdentity,
} = require('./musicIdentity/recordingEvidence');
const { normalizeForCompare } = require('./musicIdentity/text');

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PLAYLISTS = 250;
const MAX_ENTRIES = 5000;

function text(value) {
  return typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\p{Bidi_Control}]/gu, ' ')
        .trim()
        .slice(0, 200)
    : '';
}

async function readSpotifyPlaylistFile(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const { size } = stat;
    if (!stat.isFile() || size > MAX_FILE_BYTES) return null;
    const buffer = Buffer.alloc(size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== size) return null;
    const contents = buffer.toString('utf8', 0, length).replace(/^\uFEFF/u, '');
    if (path.extname(filePath).toLowerCase() === '.csv') {
      return parsePlaylistCsv(contents, path.parse(filePath).name);
    }
    try {
      return parseSpotifyPlaylists(JSON.parse(contents));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return null;
    }
  } finally {
    await handle.close();
  }
}

function parsePlaylistCsv(input, name) {
  const cell = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\r|\n|$)/gy;
  let row = [];
  let columns;
  const tracks = [];
  while (cell.lastIndex < input.length) {
    const match = cell.exec(input);
    if (!match?.[0]) return null;
    const [, value, separator] = match;
    row.push(
      value.startsWith('"') ? value.slice(1, -1).replace(/""/gu, '"') : value,
    );
    if (separator === ',' && cell.lastIndex < input.length) continue;
    if (row.some((value) => value.trim())) {
      if (!columns) {
        const keys = row.map((value) =>
          value.toLowerCase().replace(/[^a-z]/gu, ''),
        );
        const find = (...names) => keys.findIndex((key) => names.includes(key));
        columns = {
          title: find('title', 'trackname', 'tracktitle'),
          artist: find('artist', 'artists', 'artistname', 'artistnames'),
          album: find('album', 'albumname'),
          isrc: find('isrc'),
        };
        if (columns.title < 0 || columns.artist < 0) return null;
      } else {
        const title = text(row[columns.title]);
        tracks.push({
          title,
          artist: text(row[columns.artist]),
          album: text(row[columns.album]),
          isrc: text(row[columns.isrc]),
          unavailable: !title,
        });
        if (tracks.length > MAX_ENTRIES) break;
      }
    }
    row = [];
  }
  return columns
    ? [
        {
          id: '0',
          name: text(name),
          tracks: tracks.slice(0, MAX_ENTRIES),
          truncated: tracks.length > MAX_ENTRIES,
        },
      ]
    : null;
}

function parseSpotifyPlaylists(document) {
  if (
    !Array.isArray(document?.playlists) ||
    document.playlists.length > MAX_PLAYLISTS
  )
    return null;
  if (
    !document.playlists.every(
      (list) => typeof list?.name === 'string' && Array.isArray(list.items),
    )
  )
    return null;
  return document.playlists.map((list, index) => ({
    id: String(index),
    name: text(list.name),
    truncated: list.items.length > MAX_ENTRIES,
    tracks: list.items.slice(0, MAX_ENTRIES).map((item) => {
      const track = item?.track ?? item?.localTrack;
      const title = text(track?.trackName ?? track?.name);
      return {
        title: title || text(item?.episode?.episodeName),
        artist: text(track?.artistName),
        album: text(track?.albumName),
        unavailable: !title,
      };
    }),
  }));
}

function observation(track) {
  return buildObservedTrack({
    title: track.title,
    artistCredit: track.artist,
    album: track.album,
    durationSeconds: track.duration,
    isrc: track.isrc,
  });
}

function localOption(track) {
  return {
    id: track.id,
    title: text(track.title),
    artist: text(track.artist),
    album: text(track.album),
    duration: Number.isFinite(track.duration)
      ? Math.round(track.duration)
      : null,
  };
}

function buildPlaylistImportRows(sourceTracks, library) {
  const byId = new Map();
  const byTitle = new Map();
  for (const track of library) {
    if (!isBoundedTrackId(track.id)) continue;
    byId.set(track.id, track);
    const title = normalizeForCompare(track.title);
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(track);
  }

  return sourceTracks.map((source, index) => {
    const row = {
      index,
      title: text(source.title),
      artist: text(source.artist),
      unavailable: Boolean(source.unavailable),
      candidates: [],
      selected: '',
    };
    if (row.unavailable) return row;
    const sameVideo = source.videoId && byId.get(source.videoId);
    if (sameVideo && sameVideo.sourceType !== 'local-file') {
      return {
        ...row,
        candidates: [localOption(sameVideo)],
        selected: sameVideo.id,
      };
    }
    const expected = observation({
      ...source,
      artist: source.videoId ? undefined : source.artist,
    });
    const possible = byTitle.get(normalizeForCompare(source.title)) ?? [];
    const matches = possible
      .map((track) => {
        const evidence = compareRecordingIdentity(expected, observation(track));
        const exactRecording = evidence.ids.relation === 'exact';
        const exactMetadata =
          evidence.artist.exact &&
          evidence.album.exact &&
          evidence.ids.relation !== 'conflict' &&
          !evidence.version.candidateIntroduces &&
          (evidence.duration.delta === null || evidence.duration.delta <= 5);
        const rank = exactRecording
          ? 5
          : exactMetadata
            ? 4
            : 2 * Number(evidence.artist.exact) + Number(evidence.album.exact);
        return { track, rank };
      })
      .sort((a, b) => b.rank - a.rank);
    const [best, runnerUp] = matches;
    return {
      ...row,
      candidates: matches.slice(0, 5).map(({ track }) => localOption(track)),
      selected:
        best?.rank >= 4 && runnerUp?.rank !== best.rank ? best.track.id : '',
    };
  });
}

module.exports = { buildPlaylistImportRows, readSpotifyPlaylistFile };
