import { computed, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const data = vi.hoisted(() => ({ tracks: [], playlists: [] }));
vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({
    tracksById: computed(
      () => new Map(data.tracks.map((track) => [track.id, track])),
    ),
  }),
}));
vi.mock('./usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: {
      get playlists() {
        return data.playlists;
      },
    },
  }),
}));
import { useLibraryArtwork } from './useLibraryArtwork.js';
beforeEach(() => {
  data.tracks = reactive([]);
  data.playlists = reactive([]);
});
describe('library artwork adapters', () => {
  it('uses current local artwork without overwriting candidate identity, version or status', () => {
    data.tracks.push({
      id: 'a',
      thumbnailUrl: 'utawakui-media://track/a/cover.jpg',
      title: 'Local title',
    });
    const source = {
      id: 'a',
      title: 'Candidate title',
      artist: 'Singer',
      status: 'done',
      thumbnailUrl: 'https://i.ytimg.com/a',
    };
    const { trackArtwork } = useLibraryArtwork();
    const row = computed(() => trackArtwork(source));
    expect(row.value).toEqual({
      ...source,
      thumbnailUrl: data.tracks[0].thumbnailUrl,
    });
    data.tracks[0].thumbnailUrl = 'updated-cover';
    expect(row.value.thumbnailUrl).toBe('updated-cover');
    expect(source.thumbnailUrl).toBe('https://i.ytimg.com/a');
    expect(trackArtwork({ id: 'missing' })).toEqual({ id: 'missing' });
  });
  it('matches collection artwork by exact source, preserving remote artwork before import', () => {
    const source = { platform: 'yt-music', id: 'OLAK5uy_test' };
    const { collectionArtwork } = useLibraryArtwork();
    const track = { id: source.id, thumbnailUrl: 'remote' };
    expect(collectionArtwork(track, source)).toBe(track);
    data.playlists.push({ kind: 'album', source, coverUrl: 'local-cover' });
    expect(collectionArtwork(track, source).thumbnailUrl).toBe('local-cover');
    expect(collectionArtwork(track, { ...source, platform: 'youtube' })).toBe(
      track,
    );
  });
});
