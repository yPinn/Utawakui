import { h, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { t } from '../../utils/i18n.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Modal from './PlaylistImportModal.vue';

const fixture = vi.hoisted(() => ({
  refresh: vi.fn(async () => {}),
  notify: vi.fn(),
  findReviewedPlaylistTrack: vi.fn((request) =>
    window.Utawakui.findPlaylistImportTrack(request),
  ),
  submitReviewedPlaylist: vi.fn(async () => ({ ok: true, value: 'batch' })),
}));
vi.mock('../../composables/useImportSession.js', () => ({
  useImportSession: () => fixture,
}));
vi.mock('../../composables/useAppNotifications.js', () => ({
  useAppNotifications: () => ({ notify: fixture.notify }),
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({ refresh: fixture.refresh }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('section', [
          h('header', slots['header-actions']?.()),
          slots.default?.(),
          slots.footer?.(),
        ]),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label'],
    setup: (props) => () => h('button', props.label),
  },
}));
vi.mock('../ui/UiActionMenu.vue', () => ({
  default: {
    props: ['open', 'content'],
    emits: ['select', 'close'],
    setup:
      (props, { emit }) =>
      () =>
        props.open
          ? h(
              'div',
              { role: 'menu' },
              props.content.groups.flatMap(({ items }) =>
                items.map((item) =>
                  h(
                    'button',
                    {
                      role: 'menuitem',
                      onClick: () => {
                        emit('select', item.value ?? item);
                        emit('close');
                      },
                    },
                    item.label,
                  ),
                ),
              ),
            )
          : null,
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
vi.mock('../ui/UiTextField.vue', () => ({
  default: {
    props: ['id', 'modelValue'],
    emits: ['update:modelValue'],
    setup:
      (props, { emit }) =>
      () =>
        h('input', {
          id: props.id,
          value: props.modelValue,
          onInput: (event) => emit('update:modelValue', event.target.value),
        }),
  },
}));
vi.mock('../ui/UiSelect.vue', () => ({
  default: {
    props: ['id', 'modelValue'],
    emits: ['update:modelValue'],
    setup:
      (props, { emit }) =>
      () =>
        h('select', {
          id: props.id,
          value: props.modelValue,
          onChange: (value) => emit('update:modelValue', value),
        }),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('../ui/UiStack.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
attachClientRender(Modal, './PlaylistImportModal.vue', import.meta.url);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('reads a Spotify link and sends a confirmed missing track to the shared import queue', async () => {
  const url = 'https://open.spotify.com/playlist/abcdefghijklmnopqrstUV';
  const audio = 'abcdefghijk';
  const api = {
    getSpotifyPlaylistImportStatus: vi.fn(async () => ({ configured: true })),
    getPlatformVideoAccount: vi.fn(async () => ({
      ok: true,
      value: { configured: true, channel: { title: 'Studio' } },
    })),
    readSpotifyPlaylistLink: vi.fn(async () => ({
      ok: true,
      value: { id: 'draft', entries: [{ id: '0', name: 'Studio mix' }] },
    })),
    previewPlaylistImport: vi.fn(async () => ({
      ok: true,
      value: {
        token: 'review',
        canSearch: true,
        rows: [{ index: 0, title: 'Song', selected: '', candidates: [] }],
      },
    })),
    findPlaylistImportTrack: vi.fn(async () => ({
      ok: true,
      value: [{ id: audio, title: 'Song', remote: true }],
    })),
    clearPlaylistImport: vi.fn(async () => {}),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const submitted = vi.fn();
  const mounted = mount(Modal, { onSubmitted: submitted });
  const find = (predicate) => findAll(mounted.root, predicate)[0];
  const button = (key) =>
    find((node) => node.type === 'button' && textContent(node) === t(key));
  await vi.waitFor(() =>
    expect(find((node) => node.type === 'form')).toBeDefined(),
  );
  expect(button('import.playlists.readYoutube')).toBeDefined();
  expect(button('import.playlists.fileImport')).toBeUndefined();
  trigger(
    find((node) => node.props.id === 'playlist-import-spotify-link'),
    'onInput',
    { target: { value: url } },
  );
  trigger(
    find((node) => node.type === 'form'),
    'onSubmit',
    { preventDefault: () => {} },
  );
  await vi.waitFor(() =>
    expect(button('import.playlists.findSource')).toBeDefined(),
  );
  expect(api.readSpotifyPlaylistLink).toHaveBeenCalledWith(url);
  trigger(button('import.playlists.findSource'), 'onClick');
  const selection = () =>
    find((node) => node.props.id === 'playlist-import-track-0');
  await vi.waitFor(() => expect(selection()).toBeDefined());
  expect(api.findPlaylistImportTrack).toHaveBeenCalledWith({
    id: 'draft',
    token: 'review',
    index: 0,
  });
  trigger(selection(), 'onChange', audio);
  await vi.waitFor(() =>
    expect(button('import.playlists.downloadAndSave').props.disabled).toBe(
      false,
    ),
  );
  trigger(button('import.playlists.downloadAndSave'), 'onClick');
  await vi.waitFor(() => expect(submitted).toHaveBeenCalledWith('batch'));
  expect(fixture.submitReviewedPlaylist).toHaveBeenCalledWith({
    id: 'draft',
    token: 'review',
    name: 'Studio mix',
    selections: [audio],
  });
  mounted.app.unmount();
});

it('keeps file import behind the more options menu even when Spotify account import is unavailable', async () => {
  const api = {
    getSpotifyPlaylistImportStatus: vi.fn(async () => ({ configured: false })),
    getPlatformVideoAccount: vi.fn(async () => ({
      ok: true,
      value: { configured: false },
    })),
    chooseSpotifyPlaylistFile: vi.fn(async () => ({
      ok: true,
      value: { id: 'draft', entries: [{ id: '0', name: 'Studio mix' }] },
    })),
    previewPlaylistImport: vi.fn(async () => ({
      ok: true,
      value: {
        token: 'review',
        rows: [
          {
            index: 0,
            title: 'Song',
            selected: '',
            candidates: [{ id: 'studio', title: 'Song', album: 'Studio' }],
          },
        ],
      },
    })),
    savePlaylistImport: vi.fn(async () => ({
      ok: true,
      value: { playlistId: 'saved' },
    })),
    clearPlaylistImport: vi.fn(async () => {}),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const close = vi.fn();
  const mounted = mount(Modal, { onClose: close });
  const button = (key) =>
    findAll(
      mounted.root,
      (node) => node.type === 'button' && textContent(node) === t(key),
    )[0];
  await vi.waitFor(() =>
    expect(textContent(mounted.root)).toContain(
      t('errors.PLAYLIST_IMPORT_SPOTIFY_NOT_CONFIGURED.message'),
    ),
  );
  expect(textContent(mounted.root)).not.toMatch(/CSV|JSON/u);
  expect(button('import.playlists.fileImport')).toBeUndefined();
  expect(api.chooseSpotifyPlaylistFile).not.toHaveBeenCalled();

  const more = () => button('import.playlists.moreImportOptions');
  expect(more().props['aria-expanded']).toBe(false);
  trigger(more(), 'onClick', { currentTarget: more() });
  await nextTick();
  expect(more().props['aria-expanded']).toBe(true);
  expect(api.chooseSpotifyPlaylistFile).not.toHaveBeenCalled();
  expect(button('import.playlists.fileImport').props.role).toBe('menuitem');
  trigger(button('import.playlists.fileImport'), 'onClick');
  const track = await vi.waitFor(() => {
    const current = findAll(
      mounted.root,
      (node) => node.props.id === 'playlist-import-track-0',
    )[0];
    expect(current).toBeDefined();
    return current;
  });
  expect(api.chooseSpotifyPlaylistFile).toHaveBeenCalledOnce();
  expect(more().props['aria-expanded']).toBe(false);
  expect(button('import.playlists.readYoutube')).toBeUndefined();
  expect(button('playlist.sidebar.create').props.disabled).toBe(true);
  trigger(track, 'onChange', 'studio');
  await vi.waitFor(() =>
    expect(button('playlist.sidebar.create').props.disabled).toBe(false),
  );
  trigger(button('playlist.sidebar.create'), 'onClick');
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(api.previewPlaylistImport).toHaveBeenCalledWith({
    id: 'draft',
    entryId: '0',
  });
  expect(api.savePlaylistImport).toHaveBeenCalledWith({
    id: 'draft',
    token: 'review',
    name: 'Studio mix',
    selections: ['studio'],
  });
  expect(fixture.refresh).toHaveBeenCalledOnce();
  mounted.app.unmount();
  expect(api.clearPlaylistImport).toHaveBeenCalledWith('draft');
});
