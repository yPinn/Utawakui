import { describe, expect, it, vi } from 'vitest';
import startupMigrationsModule from './startupMigrations.js';

const { runStartupMigrations } = startupMigrationsModule;

describe('startup migrations', () => {
  it('does not enumerate tracks when no dependent migration requests them', () => {
    const listTracks = vi.fn();
    const migrateTrackAlbumMetadata = vi.fn(() => false);
    const migratePlaylistKinds = vi.fn(() => false);

    runStartupMigrations('D:\\Music\\Utawakui', {
      classifyCollectionKind: vi.fn(),
      listTracks,
      migratePlaylistKinds,
      migrateTrackAlbumMetadata,
      readTrackInfoMetadata: vi.fn(),
    });

    expect(migrateTrackAlbumMetadata).toHaveBeenCalledOnce();
    expect(migratePlaylistKinds).toHaveBeenCalledWith(
      'D:\\Music\\Utawakui',
      expect.any(Function),
      expect.any(Function),
    );
    expect(listTracks).not.toHaveBeenCalled();
  });

  it('builds the filesystem track map only when the playlist migration needs it', () => {
    const tracks = [
      { id: 'track-1', album: 'Album' },
      { id: 'track-2', album: 'Album' },
    ];
    const listTracks = vi.fn(() => tracks);
    const migratePlaylistKinds = vi.fn((dir, getTracksById) => {
      expect(dir).toBe('D:\\Music\\Utawakui');
      expect(getTracksById()).toEqual(
        new Map(tracks.map((track) => [track.id, track])),
      );
      return true;
    });

    runStartupMigrations('D:\\Music\\Utawakui', {
      classifyCollectionKind: vi.fn(),
      listTracks,
      migratePlaylistKinds,
      migrateTrackAlbumMetadata: vi.fn(),
      readTrackInfoMetadata: vi.fn(),
    });

    expect(listTracks).toHaveBeenCalledOnce();
    expect(migratePlaylistKinds).toHaveBeenCalledOnce();
  });
});
