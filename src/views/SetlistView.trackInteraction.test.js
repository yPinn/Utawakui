import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SetlistView.vue', import.meta.url),
  'utf8',
);

describe('SetlistView track interaction owner', () => {
  it('owns transient selection separately from current playback', () => {
    expect(source).toContain('const selectedTrackId = shallowRef(null);');
    expect(source).toContain('function selectTrack(track)');
    expect(source).toContain(':active="selectedTrackId === track.id"');
    expect(source).toContain(':selected-track-id="selectedTrackId"');
    expect(source).toContain('selection-action');
  });

  it('separates row selection from pointer and keyboard activation', () => {
    expect(source).toContain('@row-click="selectTrack(track)"');
    expect(source).toContain('@row-dblclick="activateTrack(track)"');
    expect(source).toContain('@activate="activateTrack(track)"');
    expect(source).toContain('@select-track="selectTrack"');
    expect(source).toContain('@activate-track="activateTrack"');
    expect(source).not.toContain('@click="playRow(track)"');
    expect(source).not.toContain('@select-track="playRow"');
  });

  it('keeps the destructive child action outside double-click activation', () => {
    expect(source).toContain(
      '<div class="row-actions" @click.stop @dblclick.stop>',
    );
  });

  it('builds playback from the current visible order in every library mode', () => {
    expect(source).toMatch(
      /function currentVisibleQueueTracks\(\)[\s\S]*?visibleTracks\.value[\s\S]*?visiblePlaylistEntries\.value\.map/u,
    );
    expect(source).toMatch(
      /function activateTrack\(track\)[\s\S]*?currentVisibleQueueTracks\(\)[\s\S]*?setQueue\(queueTracks, track\.id/u,
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
      "import { useCollectionPlayback } from '../composables/useCollectionPlayback.js'",
    );
    expect(source).toContain('<SetlistCollectionHeader');
    expect(source).toContain(':playing="selectedCollectionIsPlaying"');
    expect(source).toContain(
      ':shuffle-active="selectedCollectionShuffleActive"',
    );
    expect(source).toContain(
      '@toggle-playback="toggleSelectedCollectionPlayback"',
    );
    expect(source).toContain(
      '@toggle-shuffle="toggleSelectedCollectionShuffle"',
    );
    expect(source).toContain('@add-to-queue="enqueueSelectedCollection"');
    expect(source).toContain('@menu-action="handlePlaylistMenuAction"');
  });
});
