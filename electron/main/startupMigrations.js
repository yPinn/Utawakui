'use strict';

const { readTrackInfoMetadata } = require('../lib/downloader');
const { listTracks, migrateTrackAlbumMetadata } = require('../lib/library');
const { migratePlaylistKinds } = require('../lib/playlists');
const { classifyCollectionKind } = require('../lib/albumClassifier');

// Run version-gated migrations before ordinary writes stamp the files.
// Album metadata must exist before playlist-kind classification.
function runStartupMigrations(downloadDir) {
  migrateTrackAlbumMetadata(downloadDir, readTrackInfoMetadata);
  const tracksById = new Map(
    listTracks(downloadDir).map((track) => [track.id, track]),
  );
  migratePlaylistKinds(downloadDir, tracksById, classifyCollectionKind);
}

module.exports = { runStartupMigrations };
