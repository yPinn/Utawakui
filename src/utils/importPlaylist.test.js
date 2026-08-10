import { describe, expect, it } from 'vitest';
import {
  filterPlaylistImportTracks,
  getPlaylistImportStats,
  hasImportableSelection,
} from './importPlaylist.js';

const tracks = [
  {
    id: 'already',
    title: 'Already Here',
    alreadyDownloaded: true,
    selected: false,
    status: 'pending',
  },
  {
    id: 'pending-selected',
    title: 'Pending Selected',
    alreadyDownloaded: false,
    selected: true,
    status: 'pending',
  },
  {
    id: 'pending-unselected',
    title: 'Pending Unselected',
    alreadyDownloaded: false,
    selected: false,
    status: 'pending',
  },
  {
    id: 'downloading',
    title: 'Downloading',
    alreadyDownloaded: false,
    selected: true,
    status: 'downloading',
  },
  {
    id: 'done',
    title: 'Done',
    alreadyDownloaded: false,
    selected: true,
    status: 'done',
  },
  {
    id: 'failed',
    title: 'Failed',
    alreadyDownloaded: false,
    selected: true,
    status: 'error',
  },
];

describe('getPlaylistImportStats', () => {
  it('counts playlist import states for the summary bar', () => {
    expect(getPlaylistImportStats(tracks)).toEqual({
      total: 6,
      selected: 4,
      alreadyDownloaded: 1,
      pending: 2,
      downloading: 1,
      done: 1,
      error: 1,
      downloadableSelected: 3,
      completedLike: 2,
    });
  });

  it('handles an empty or missing playlist', () => {
    expect(getPlaylistImportStats(null)).toEqual({
      total: 0,
      selected: 0,
      alreadyDownloaded: 0,
      pending: 0,
      downloading: 0,
      done: 0,
      error: 0,
      downloadableSelected: 0,
      completedLike: 0,
    });
  });
});

describe('filterPlaylistImportTracks', () => {
  it('returns all tracks by default', () => {
    expect(filterPlaylistImportTracks(tracks, 'all').map((t) => t.id)).toEqual(
      tracks.map((t) => t.id),
    );
  });

  it('filters selected tracks', () => {
    expect(
      filterPlaylistImportTracks(tracks, 'selected').map((t) => t.id),
    ).toEqual(['pending-selected', 'downloading', 'done', 'failed']);
  });

  it('filters tracks missing from the local library', () => {
    expect(
      filterPlaylistImportTracks(tracks, 'missing').map((t) => t.id),
    ).toEqual([
      'pending-selected',
      'pending-unselected',
      'downloading',
      'failed',
    ]);
  });

  it('filters completed or already-downloaded tracks', () => {
    expect(
      filterPlaylistImportTracks(tracks, 'downloaded').map((t) => t.id),
    ).toEqual(['already', 'done']);
  });

  it('filters failed tracks', () => {
    expect(
      filterPlaylistImportTracks(tracks, 'failed').map((t) => t.id),
    ).toEqual(['failed']);
  });
});

describe('hasImportableSelection', () => {
  it('requires a selected track that is not already downloaded or done', () => {
    expect(hasImportableSelection(tracks)).toBe(true);
    expect(
      hasImportableSelection([
        { id: 'already', alreadyDownloaded: true, selected: true },
        {
          id: 'done',
          alreadyDownloaded: false,
          selected: true,
          status: 'done',
        },
      ]),
    ).toBe(false);
  });
});
