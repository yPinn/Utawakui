import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./LibraryBrowseContent.vue', import.meta.url),
  'utf8',
);

describe('LibraryBrowseContent track interaction owner', () => {
  it('owns transient selection separately from current playback', () => {
    expect(source).toContain('const selectedTrackId = shallowRef(null);');
    expect(source).toContain('function selectTrack(track)');
    expect(source).toContain(':selected-track-id="selectedTrackId"');
    expect(source).toContain(
      "import TrackTable from '../track/TrackTable.vue'",
    );
    expect(source).not.toContain('UiTrackRow');
  });

  it('separates row selection from pointer and keyboard activation', () => {
    expect(source).toContain('@select-track="selectTrack"');
    expect(source).toContain('@activate-track="activateTrack"');
    expect(source).not.toContain('@click="playRow(track)"');
    expect(source).not.toContain('@select-track="playRow"');
  });

  it('routes destructive library actions through the shared trailing menu', () => {
    expect(source).toContain(':can-delete="addMenuOptions.canDelete"');
    expect(source).toContain('TRACK_MENU_ACTIONS.deleteTrack');
    expect(source).not.toContain('@click="removeTrack(track)"');
  });

  it('builds playback from the current visible order in every library mode', () => {
    expect(source).toMatch(
      /function currentVisibleQueueTracks\(\)[\s\S]*?visibleTableEntries\.value\.map/u,
    );
    expect(source).toMatch(
      /function activateTrack\(track\)[\s\S]*?currentVisibleQueueTracks\(\)[\s\S]*?setQueue\(queueTracks, track\.id/u,
    );
  });

  it('uses one canonical table and disables custom reorder while filtering', () => {
    expect(source).toContain('<TrackTable');
    expect(source).toContain(':entries="visibleTableEntries"');
    expect(source).toContain("mode.value === 'all' ? 'library' : mode.value");
    expect(source).toContain(':variant="tableVariant"');
    expect(source).toContain('@move-track="movePlaylistTrack"');
    expect(source).toMatch(
      /const canDragPlaylistRows = computed\([\s\S]*?mode\.value === 'playlist'[\s\S]*?!normalizedSearchQuery\.value[\s\S]*?playlistSort\.value\.key === null/u,
    );
  });

  it('keeps header playback on the full sorted collection instead of the search result', () => {
    expect(source).toContain('const orderedPlaylistEntries = computed(');
    expect(source).toContain('const visiblePlaylistEntries = computed(() =>');
    expect(source).toMatch(/orderedPlaylistEntries\.value\s*\.filter/u);
    expect(source).toContain('const collectionPlaybackTracks = computed(');
    expect(source).toMatch(/orderedPlaylistEntries\.value\.map/u);
    expect(source).toContain(
      'collectionPlayback.togglePlayback(selectedCollectionPlaybackContext.value)',
    );
    expect(source).not.toContain('function playPlaylist()');
  });

  it('projects shared collection playback state and explicit action ownership into the header', () => {
    expect(source).toContain(
      "import { useCollectionPlayback } from '../../composables/useCollectionPlayback.js'",
    );
    expect(source).toContain('<LibraryCollectionHeader');
    expect(source).toContain(':playing="selectedCollectionIsPlaying"');
    expect(source).toContain(
      '@toggle-playback="toggleSelectedCollectionPlayback"',
    );
    // Header shuffle is the PlayerBar toggle: same state, guard and action.
    expect(source).toContain(':shuffle-active="queueState.isShuffle"');
    expect(source).toContain(':can-shuffle="queueState.tracks.length > 1"');
    expect(source).toContain('@toggle-shuffle="toggleShuffle"');
    expect(source).toContain('@add-to-queue="enqueueSelectedCollection"');
    expect(source).toContain('@menu-action="handleCollectionMenuAction"');
    expect(source).toMatch(
      /function handleCollectionMenuAction\(value\) \{[\s\S]*?else \{\s*handlePlaylistMenuAction\(value\);/u,
    );
    expect(source).toContain('@choose-photo="chooseSelectedArtistPhoto"');
  });

  it('routes supporting album playback through authoritative membership without navigating', () => {
    expect(source).toContain('const playingSupportingAlbumId = computed(() =>');
    expect(source).toMatch(
      /function toggleSupportingAlbumPlayback\(albumId\)[\s\S]*?albumEntries\.value\.find\([\s\S]*?collection\.id === albumId[\s\S]*?collectionPlayback\.togglePlayback\(\{[\s\S]*?sourceId: entry\.collection\.id,[\s\S]*?sourceName: playlistDisplayName\(entry\.collection\),[\s\S]*?tracks: entry\.tracks,/u,
    );
    expect(source).toContain(':playing-album-id="playingSupportingAlbumId"');
    expect(
      source.match(/@play-album="toggleSupportingAlbumPlayback"/gu),
    ).toHaveLength(2);
  });

  it('offers explicit YT Music photo candidates only for an artist without a photo', () => {
    expect(source).toContain(
      "import ArtistPhotoCandidateModal from '../artists/ArtistPhotoCandidateModal.vue'",
    );
    expect(source).toContain(
      "import { useArtistPhotoCandidates } from '../../composables/useArtistPhotoCandidates.js'",
    );
    expect(source).toMatch(
      /!artistPage\.value\.photoUrl[\s\S]*?ARTIST_PHOTO_ACTIONS\.searchOnline/u,
    );
    expect(source).toContain("label: '搜尋線上藝人照片'");
    expect(source).toMatch(
      /ARTIST_PHOTO_ACTIONS\.searchOnline[\s\S]*?artistPhotoCandidates\.openForArtist\(artistPage\.value\)/u,
    );
    expect(source).toContain('<ArtistPhotoCandidateModal');
    expect(source).toContain(
      '@select-candidate="artistPhotoCandidates.selectCandidate"',
    );
    expect(source).toContain('@confirm="artistPhotoCandidates.applySelected"');
    expect(source).not.toMatch(
      /resolveArtistPhotos\([\s\S]*?searchArtistPhotoCandidates/u,
    );
  });
});
