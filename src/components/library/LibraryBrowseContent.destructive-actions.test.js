import { readFileSync } from 'node:fs';
import { compileScript, parse } from '@vue/compiler-sfc';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('./LibraryBrowseContent.vue', import.meta.url),
  'utf8',
);
const { descriptor } = parse(source);
const { scriptSetupAst } = compileScript(descriptor, {
  id: 'library-action-test',
});
function action(name, dependencies) {
  const node = scriptSetupAst.find(
    (node) => node.type === 'FunctionDeclaration' && node.id.name === name,
  );
  expect(node, name).toBeDefined();
  return new Function(
    ...Object.keys(dependencies),
    `${descriptor.scriptSetup.content.slice(node.start, node.end)};return ${name};`,
  )(...Object.values(dependencies));
}

describe('library immediate removal confirmations', () => {
  it.each([false, true])(
    'confirms artist photo deletion before writing: %s',
    async (confirmed) => {
      const clearArtistPhoto = vi.fn();
      const confirmAction = vi.fn().mockResolvedValue(confirmed);
      const remove = action('confirmClearArtistPhoto', {
        artistPage: { value: { id: 'a1', name: 'Artist', photoUrl: 'photo' } },
        clearArtistPhoto,
        confirmAction,
      });
      await remove();
      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({ intent: 'danger' }),
      );
      expect(clearArtistPhoto.mock.calls).toEqual(confirmed ? [['a1']] : []);
    },
  );
  it('does not delete a new artist photo while an old confirmation is open', async () => {
    const artistPage = { value: { id: 'a1', name: 'Artist', photoUrl: 'old' } };
    let finish;
    const clearArtistPhoto = vi.fn();
    const remove = action('confirmClearArtistPhoto', {
      artistPage,
      clearArtistPhoto,
      confirmAction: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const pending = remove();
    artistPage.value.photoUrl = 'new';
    finish(true);
    await pending;
    expect(clearArtistPhoto).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'confirms persisted playlist membership removal: %s',
    async (confirmed) => {
      const removeTrackFromPlaylist = vi.fn().mockResolvedValue(true);
      const selectedTrackId = { value: 't1' };
      const confirmAction = vi.fn().mockResolvedValue(confirmed);
      const remove = action('confirmRemovePlaylistTrack', {
        playlistState: {
          selectedId: 'p1',
          playlists: [
            { id: 'p1', kind: 'playlist', name: '歌單', trackIds: ['t1'] },
          ],
        },
        selectedTrackId,
        confirmAction,
        removeTrackFromPlaylist,
      });
      await remove({ id: 't1', title: 'Song' }, 'p1');
      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'danger',
          message: expect.stringContaining('音檔會保留'),
        }),
      );
      expect(removeTrackFromPlaylist.mock.calls).toEqual(
        confirmed ? [['p1', 't1']] : [],
      );
      expect(selectedTrackId.value).toBe(confirmed ? null : 't1');
    },
  );
  it('does not offer membership removal for a read-only album', async () => {
    const confirmAction = vi.fn();
    const remove = action('confirmRemovePlaylistTrack', {
      playlistState: {
        playlists: [{ id: 'p1', kind: 'album', trackIds: ['t1'] }],
      },
      confirmAction,
    });
    await remove({ id: 't1', title: 'Song' }, 'p1');
    expect(confirmAction).not.toHaveBeenCalled();
  });
  it.each([
    [false, 'p1'],
    [true, 'another-playlist'],
  ])(
    'keeps selection when removal fails or belongs to another page: %s / %s',
    async (succeeded, selectedId) => {
      const selectedTrackId = { value: 't1' };
      const remove = action('confirmRemovePlaylistTrack', {
        playlistState: {
          selectedId,
          playlists: [
            { id: 'p1', kind: 'playlist', name: '歌單', trackIds: ['t1'] },
          ],
        },
        selectedTrackId,
        confirmAction: vi.fn().mockResolvedValue(true),
        removeTrackFromPlaylist: vi.fn().mockResolvedValue(succeeded),
      });
      await remove({ id: 't1', title: 'Song' }, 'p1');
      expect(selectedTrackId.value).toBe('t1');
    },
  );
});
