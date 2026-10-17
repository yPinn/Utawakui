import { describe, expect, it, vi } from 'vitest';
import { createLibraryTrackSnapshot } from './libraryTrackSnapshot.js';

function createSnapshot() {
  let clock = 1_000;
  const listLibraryTracks = vi.fn((directory) => [{ id: `${directory}-1` }]);
  const snapshot = createLibraryTrackSnapshot({
    listLibraryTracks,
    now: () => clock,
    maxAgeMs: 100,
  });
  return {
    snapshot,
    listLibraryTracks,
    advance: (ms) => {
      clock += ms;
    },
  };
}

describe('createLibraryTrackSnapshot', () => {
  it('reuses the latest fresh list for recent reads of the same directory', () => {
    const { snapshot, listLibraryTracks, advance } = createSnapshot();
    const tracks = snapshot.listFresh('lib');
    advance(100);

    expect(snapshot.listRecent('lib')).toBe(tracks);
    expect(listLibraryTracks).toHaveBeenCalledOnce();
  });

  it('always rescans on listFresh', () => {
    const { snapshot, listLibraryTracks } = createSnapshot();
    snapshot.listFresh('lib');
    snapshot.listFresh('lib');

    expect(listLibraryTracks).toHaveBeenCalledTimes(2);
  });

  it('rescans when the snapshot is too old, invalidated, or for another directory', () => {
    const { snapshot, listLibraryTracks, advance } = createSnapshot();
    snapshot.listFresh('lib');
    advance(101);
    snapshot.listRecent('lib');
    expect(listLibraryTracks).toHaveBeenCalledTimes(2);

    snapshot.invalidate();
    snapshot.listRecent('lib');
    expect(listLibraryTracks).toHaveBeenCalledTimes(3);

    expect(snapshot.listRecent('other')).toEqual([{ id: 'other-1' }]);
    expect(listLibraryTracks).toHaveBeenCalledTimes(4);
  });

  it('caches a rescan from listRecent for the next recent read', () => {
    const { snapshot, listLibraryTracks } = createSnapshot();
    const tracks = snapshot.listRecent('lib');

    expect(snapshot.listRecent('lib')).toBe(tracks);
    expect(listLibraryTracks).toHaveBeenCalledOnce();
  });
});
