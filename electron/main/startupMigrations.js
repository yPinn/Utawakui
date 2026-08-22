'use strict';

const { readTrackInfoMetadata } = require('../lib/downloader');
const { listTracks, migrateTrackAlbumMetadata } = require('../lib/library');
const { migratePlaylistKinds } = require('../lib/playlists');
const { classifyCollectionKind } = require('../lib/albumClassifier');

// Run version-gated migrations before ordinary writes stamp the files.
// Album metadata must exist before playlist-kind classification.
function runStartupMigrations(downloadDir, overrides = {}) {
  const dependencies = {
    classifyCollectionKind,
    listTracks,
    migratePlaylistKinds,
    migrateTrackAlbumMetadata,
    readTrackInfoMetadata,
    ...overrides,
  };
  dependencies.migrateTrackAlbumMetadata(
    downloadDir,
    dependencies.readTrackInfoMetadata,
  );
  dependencies.migratePlaylistKinds(
    downloadDir,
    () =>
      new Map(
        dependencies.listTracks(downloadDir).map((track) => [track.id, track]),
      ),
    dependencies.classifyCollectionKind,
  );
}

module.exports = { runStartupMigrations };
