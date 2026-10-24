/* eslint-disable vue/one-component-per-file -- Test doubles isolate workflow boundaries. */
import { defineComponent, h, nextTick, reactive } from 'vue';
import { setImmediate } from 'node:timers';
import { afterEach, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import LibraryReleaseCatalog from './LibraryReleaseCatalog.vue';
const workflow = vi.hoisted(() => ({
  state: { isResolving: false, isOpeningDiscovery: false },
  setInput: vi.fn(),
  resolveSource: vi.fn(async () => {}),
  selectPreparationTab: vi.fn(),
  showSurface: vi.fn(),
  directDownload: vi.fn(async () => true),
  refreshPlaylists: vi.fn(async () => {}),
  tables: [],
}));
vi.mock('../../composables/useReleaseCatalogDownloads.js', () => ({
  useReleaseCatalogDownloads: () => ({
    download: workflow.directDownload,
    pendingSlots: () => new Set(),
    errorFor: () => '',
  }),
}));
vi.mock('../../composables/useImportSession.js', () => ({
  useImportSession: () => workflow,
}));
vi.mock('../../composables/useAppRightDock.js', () => ({
  RIGHT_DOCK_SURFACE_PREPARATION: 'preparation',
  useAppRightDock: () => workflow,
}));
vi.mock('../../composables/useReleaseCatalog.js', () => ({
  useReleaseCatalog: () => ({ state: { revision: 0, error: '' } }),
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({ refresh: workflow.refreshPlaylists }),
}));
vi.mock('./LibrarySourceTracklist.vue', () => ({
  default: defineComponent({
    props: { catalog: { type: Object, required: true } },
    emits: ['download'],
    setup(props, { emit }) {
      return () => {
        workflow.tables.push({
          catalog: props.catalog,
          rows: [...props.catalog.rows],
        });
        return h(
          'div',
          {
            'data-source-table': true,
            'data-available-count': props.catalog.availableCount,
          },
          [
            props.catalog.rows.map((row) => row.title).join(' | '),
            h(
              'button',
              {
                'data-download': true,
                onClick: () => emit('download', { key: 'slot-2' }),
              },
              '下載',
            ),
          ],
        );
      };
    },
  }),
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: defineComponent({
    setup:
      (_, { slots, attrs }) =>
      () =>
        h('button', attrs, slots.default?.()),
  }),
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: defineComponent({
    setup:
      (_, { slots, attrs }) =>
      () =>
        h('p', attrs, slots.default?.()),
  }),
}));
attachClientRender(
  LibraryReleaseCatalog,
  './LibraryReleaseCatalog.vue',
  import.meta.url,
);
const collection = (id = 'a') => ({
  id,
  resolvedRelease: { revision: 2 },
  releaseLibraryEpoch: 7,
});
const result = (id, title) => ({
  status: 'ok',
  collectionId: id,
  revision: 2,
  libraryEpoch: 7,
  catalog: {
    structureVersion: 'v1',
    rows: [{ key: 'slot-1', position: 1, title }],
    availableCount: 0,
    hasMore: false,
  },
});
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await nextTick();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
function mountReactiveCatalog(onPreviewAvailability = vi.fn()) {
  const state = reactive({ collection: collection(), tracksById: new Map() });
  const view = mount(
    defineComponent({
      setup: () => () =>
        h(LibraryReleaseCatalog, {
          collection: state.collection,
          tracksById: state.tracksById,
          onPreviewAvailability,
        }),
    }),
  );
  return { ...view, state, onPreviewAvailability };
}
const sourceTable = (view) =>
  findAll(view.root, (node) => node.props['data-source-table'])[0];
afterEach(() => {
  workflow.state.isResolving = false;
  workflow.state.isOpeningDiscovery = false;
  workflow.tables.length = 0;
  workflow.refreshPlaylists.mockReset().mockResolvedValue(undefined);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('publishes the Main count across the full catalog for preview eligibility, not only this visible page', async () => {
  const onPreviewAvailability = vi.fn();
  const page = {
    ...result('a', 'Not owned on this page'),
    catalog: {
      rows: [{ title: 'Not owned on this page', state: 'not-imported' }],
      availableCount: 2,
      hasMore: true,
      nextOffset: 100,
    },
  };
  vi.stubGlobal('window', {
    Utawakui: { getReleaseCatalog: vi.fn(async () => page) },
  });
  const tracksById = new Map();
  const view = mount(LibraryReleaseCatalog, {
    collection: collection(),
    tracksById,
    onPreviewAvailability,
  });
  await flush();
  expect(
    onPreviewAvailability.mock.calls.map(([event]) => event.status),
  ).toEqual(['pending', 'ready']);
  expect(onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({
      libraryIdentity: tracksById,
      availableCount: 2,
      collection: expect.objectContaining({ id: 'a' }),
    }),
  );
  view.app.unmount();
});

it('keeps stale and failed catalog reads from reporting available previews', async () => {
  const onPreviewAvailability = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      getReleaseCatalog: vi.fn(async () => result('stale', 'Changed')),
    },
  });
  const view = mount(LibraryReleaseCatalog, {
    collection: collection(),
    tracksById: new Map(),
    onPreviewAvailability,
  });
  await flush();
  expect(
    onPreviewAvailability.mock.calls.map(([event]) => event.status),
  ).toEqual(['pending', 'error']);
  view.app.unmount();
});

it('routes an exact album row to direct download without touching import search or the dock', async () => {
  vi.stubGlobal('window', {
    Utawakui: { getReleaseCatalog: vi.fn(async () => result('a', 'Song')) },
  });
  const target = collection();
  const view = mount(LibraryReleaseCatalog, {
    collection: target,
    tracksById: new Map(),
  });
  await flush();
  expect(textContent(view.root)).not.toMatch(
    /從來源更新|重新讀取|本地可用|曲序依來源|解除關聯/,
  );
  trigger(
    findAll(view.root, (node) => node.props['data-download'])[0],
    'onClick',
  );
  await flush();
  expect(workflow.directDownload).toHaveBeenCalledWith(target, {
    key: 'slot-2',
  });
  expect(workflow.setInput).not.toHaveBeenCalled();
  expect(workflow.resolveSource).not.toHaveBeenCalled();
  expect(workflow.showSurface).not.toHaveBeenCalled();
  view.app.unmount();
});
it('ignores a late page after changing collections', async () => {
  let resolveFirst;
  const api = {
    getReleaseCatalog: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(result('b', 'Current')),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const state = reactive({ collection: collection('a') });
  const Root = defineComponent({
    setup: () => () =>
      h(LibraryReleaseCatalog, {
        collection: state.collection,
        tracksById: new Map(),
      }),
  });
  const view = mount(Root);
  state.collection = collection('b');
  await flush();
  resolveFirst(result('a', 'Stale'));
  await flush();
  expect(textContent(view.root)).toContain('Current');
  expect(textContent(view.root)).not.toContain('Stale');
  view.app.unmount();
});

it('keeps the same table mounted while a download refresh verifies new availability', async () => {
  const refresh = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Before download'))
    .mockReturnValueOnce(refresh.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  const table = sourceTable(view);
  view.state.tracksById = new Map([['new-track', { id: 'new-track' }]]);
  await flush();
  expect(sourceTable(view)).toBe(table);
  expect(textContent(view.root)).toContain('Before download');
  expect(textContent(view.root)).not.toContain('正在確認');
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'pending', availableCount: 0 }),
  );
  refresh.resolve({
    ...result('a', 'Downloaded'),
    catalog: { rows: [{ title: 'Downloaded' }], availableCount: 1 },
  });
  await flush();
  expect(sourceTable(view)).toBe(table);
  expect(textContent(view.root)).toContain('Downloaded');
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'ready', availableCount: 1 }),
  );
  view.app.unmount();
});

it('refreshes all expanded pages before replacing the visible catalog', async () => {
  const page = (prefix, offset, count, more) => ({
    ...result('a', ''),
    catalog: {
      rows: Array.from({ length: count }, (_, i) => ({
        title: `${prefix}-${offset + i + 1}`,
      })),
      availableCount: 1,
      hasMore: more,
      nextOffset: more ? offset + count : null,
    },
  });
  const first = deferred(),
    second = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(page('Old', 0, 100, true))
    .mockResolvedValueOnce(page('Old', 100, 50, false))
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  trigger(
    findAll(view.root, (node) => node.type === 'button').find((node) =>
      textContent(node).includes('顯示更多'),
    ),
    'onClick',
  );
  await flush();
  const table = sourceTable(view);
  expect(textContent(table)).toContain('Old-150');
  view.state.collection = {
    ...collection(),
    resolvedRelease: { revision: 3 },
  };
  await flush();
  first.resolve({ ...page('New', 0, 100, true), revision: 3 });
  await flush();
  expect(sourceTable(view)).toBe(table);
  expect(textContent(table)).toContain('Old-150');
  expect(textContent(table)).not.toContain('New-1');
  expect(getReleaseCatalog).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 100, expectedRevision: 3 }),
  );
  second.resolve({ ...page('New', 100, 50, false), revision: 3 });
  await flush();
  expect(sourceTable(view)).toBe(table);
  expect(textContent(table)).toContain('New-150');
  expect(textContent(table)).not.toContain('Old-');
  view.app.unmount();
});

it('clears old rows on library changes and ignores the prior background response', async () => {
  const refresh = deferred(),
    switched = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Old library'))
    .mockReturnValueOnce(refresh.promise)
    .mockReturnValueOnce(switched.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  view.state.tracksById = new Map();
  await flush();
  view.state.collection = { ...collection(), releaseLibraryEpoch: 8 };
  await flush();
  expect(sourceTable(view)).toBeUndefined();
  expect(textContent(view.root)).not.toContain('Old library');
  refresh.resolve(result('a', 'Late old library'));
  await flush();
  expect(sourceTable(view)).toBeUndefined();
  switched.resolve({ ...result('a', 'New library'), libraryEpoch: 8 });
  await flush();
  expect(textContent(view.root)).toContain('New library');
  expect(textContent(view.root)).not.toContain('Late old library');
  view.app.unmount();
});

it('revokes the retained snapshot when background validation fails', async () => {
  const refresh = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Old rows'))
    .mockReturnValueOnce(refresh.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  view.state.tracksById = new Map();
  await flush();
  expect(sourceTable(view)).toBeDefined();
  refresh.resolve({ ...result('a', 'Invalid'), revision: 99 });
  await flush();
  expect(sourceTable(view)).toBeUndefined();
  expect(textContent(view.root)).toContain('專輯曲目確認未完成');
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error', availableCount: 0 }),
  );
  view.app.unmount();
});

it('updates only verified availability fields while preserving the catalog and every row object', async () => {
  const rows = [
    {
      key: 'slot-1',
      position: 1,
      title: 'Undownloaded',
      artist: 'Artist',
      duration: 180,
      state: 'not-imported',
      localTrackId: null,
      linkedTrackId: null,
      localCandidateTrackId: null,
    },
    {
      key: 'slot-2',
      position: 2,
      title: 'Already owned',
      artist: 'Artist',
      duration: 190,
      state: 'available',
      localTrackId: 'owned',
      linkedTrackId: 'owned',
      localCandidateTrackId: null,
    },
  ];
  const waiting = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce({
      ...result('a', ''),
      catalog: { ...result('a', '').catalog, rows, availableCount: 1 },
    })
    .mockReturnValueOnce(waiting.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  const original = workflow.tables.at(-1),
    table = sourceTable(view);
  view.state.tracksById = new Map([['new', { id: 'new' }]]);
  await flush();
  expect(getReleaseCatalog).toHaveBeenLastCalledWith(
    expect.objectContaining({ availabilityOnly: true, offset: 0, limit: 100 }),
  );
  waiting.resolve({
    ...result('a', ''),
    catalog: {
      structureVersion: 'v1',
      availabilityOnly: true,
      availableCount: 2,
      hasMore: false,
      rows: rows.map((row, index) => ({
        key: row.key,
        position: row.position,
        state: 'available',
        localTrackId: index ? 'owned' : 'new',
        linkedTrackId: index ? 'owned' : 'new',
        localCandidateTrackId: null,
      })),
    },
  });
  await flush();
  const updated = workflow.tables.at(-1);
  expect(updated.catalog === original.catalog).toBe(true);
  expect(
    updated.rows.map((row, index) => row === original.rows[index]),
  ).toEqual([true, true]);
  expect(sourceTable(view) === table).toBe(true);
  expect(textContent(table)).toContain('Undownloaded');
  expect(updated.rows[0]).toMatchObject({
    title: 'Undownloaded',
    artist: 'Artist',
    duration: 180,
    state: 'available',
    localTrackId: 'new',
  });
  expect(table.props['data-available-count']).toBe(2);
  expect(getReleaseCatalog).toHaveBeenCalledTimes(2);
  view.app.unmount();
});

it('reads the full tracklist only when Main reports a different structure version', async () => {
  const replacement = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Original title'))
    .mockResolvedValueOnce({
      ...result('a', ''),
      catalog: {
        structureVersion: 'v2',
        availabilityOnly: true,
        rows: [{ key: 'slot-1', position: 1, state: 'not-imported' }],
      },
    })
    .mockReturnValueOnce(replacement.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  const table = sourceTable(view);
  view.state.tracksById = new Map();
  await flush();
  expect(getReleaseCatalog.mock.calls[1][0].availabilityOnly).toBe(true);
  expect(getReleaseCatalog.mock.calls[2][0]).not.toHaveProperty(
    'availabilityOnly',
  );
  expect(sourceTable(view) === table).toBe(true);
  expect(textContent(table)).toContain('Original title');
  replacement.resolve({
    ...result('a', 'New source title'),
    catalog: {
      ...result('a', 'New source title').catalog,
      structureVersion: 'v2',
    },
  });
  await flush();
  expect(sourceTable(view) === table).toBe(true);
  expect(textContent(table)).toContain('New source title');
  view.app.unmount();
});

it('patches expanded status pages atomically and keeps all 150 row objects', async () => {
  const page = (offset, statusOnly = false) => ({
    ...result('a', ''),
    catalog: {
      structureVersion: 'v1',
      availabilityOnly: statusOnly,
      availableCount: statusOnly ? 150 : 0,
      hasMore: offset === 0,
      nextOffset: offset === 0 ? 100 : null,
      rows: Array.from({ length: offset ? 50 : 100 }, (_, i) => ({
        key: `slot-${offset + i + 1}`,
        position: offset + i + 1,
        ...(statusOnly ? {} : { title: `Track ${offset + i + 1}` }),
        state: statusOnly ? 'available' : 'not-imported',
        localTrackId: statusOnly ? `track-${offset + i + 1}` : null,
      })),
    },
  });
  const first = deferred(),
    second = deferred();
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(page(0))
    .mockResolvedValueOnce(page(100))
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  trigger(
    findAll(view.root, (node) => node.type === 'button').find((node) =>
      textContent(node).includes('顯示更多'),
    ),
    'onClick',
  );
  await flush();
  const original = workflow.tables.at(-1);
  view.state.tracksById = new Map();
  await flush();
  first.resolve(page(0, true));
  await flush();
  expect(original.rows.every((row) => row.state === 'not-imported')).toBe(true);
  expect(getReleaseCatalog).toHaveBeenLastCalledWith(
    expect.objectContaining({
      offset: 100,
      availabilityOnly: true,
    }),
  );
  second.resolve(page(100, true));
  await flush();
  const updated = workflow.tables.at(-1);
  expect(updated.catalog === original.catalog).toBe(true);
  expect(updated.rows).toHaveLength(150);
  expect(
    updated.rows.every(
      (row, i) => row === original.rows[i] && row.state === 'available',
    ),
  ).toBe(true);
  expect(textContent(sourceTable(view))).toContain('Track 150');
  view.app.unmount();
});

it('rejects mismatched status slots before mutating any retained row', async () => {
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Original'))
    .mockResolvedValueOnce({
      ...result('a', ''),
      catalog: {
        structureVersion: 'v1',
        availabilityOnly: true,
        rows: [
          {
            key: 'wrong-slot',
            position: 1,
            state: 'available',
            localTrackId: 'wrong',
          },
        ],
      },
    });
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  const original = workflow.tables.at(-1);
  view.state.tracksById = new Map();
  await flush();
  expect(original.rows[0]).not.toHaveProperty('localTrackId');
  expect(sourceTable(view)).toBeUndefined();
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error' }),
  );
  view.app.unmount();
});

it('keeps the table through a revision conflict until the collection projection catches up', async () => {
  const listing = deferred();
  workflow.refreshPlaylists.mockReturnValueOnce(listing.promise);
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Keep this row'))
    .mockResolvedValueOnce({ status: 'conflict' })
    .mockResolvedValueOnce({
      ...result('a', ''),
      revision: 3,
      catalog: {
        structureVersion: 'v1',
        availabilityOnly: true,
        availableCount: 1,
        rows: [
          {
            key: 'slot-1',
            position: 1,
            state: 'available',
            localTrackId: 'new',
          },
        ],
      },
    });
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  const table = sourceTable(view),
    original = workflow.tables.at(-1);
  view.state.tracksById = new Map();
  await flush();
  expect(workflow.refreshPlaylists).toHaveBeenCalledOnce();
  expect(sourceTable(view) === table).toBe(true);
  expect(textContent(view.root)).not.toContain('專輯曲目確認未完成');
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'pending' }),
  );
  view.state.collection = { ...collection(), resolvedRelease: { revision: 3 } };
  listing.resolve();
  await flush();
  expect(sourceTable(view) === table).toBe(true);
  expect(workflow.tables.at(-1).catalog === original.catalog).toBe(true);
  expect(workflow.tables.at(-1).rows[0] === original.rows[0]).toBe(true);
  expect(original.rows[0]).toMatchObject({
    title: 'Keep this row',
    state: 'available',
    localTrackId: 'new',
  });
  expect(getReleaseCatalog).toHaveBeenCalledTimes(3);
  expect(getReleaseCatalog.mock.calls[2][0]).toMatchObject({
    expectedRevision: 3,
    availabilityOnly: true,
  });
  view.app.unmount();
});

it('fails closed without retrying indefinitely if a conflict cannot refresh the collection revision', async () => {
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Old'))
    .mockResolvedValueOnce({ status: 'conflict' });
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  view.state.tracksById = new Map();
  await flush();
  expect(workflow.refreshPlaylists).toHaveBeenCalledOnce();
  expect(getReleaseCatalog).toHaveBeenCalledTimes(2);
  expect(sourceTable(view)).toBeUndefined();
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error' }),
  );
  view.app.unmount();
});

it('ignores conflict recovery after a library switch', async () => {
  const listing = deferred();
  workflow.refreshPlaylists.mockReturnValueOnce(listing.promise);
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Old library'))
    .mockResolvedValueOnce({ status: 'conflict' })
    .mockResolvedValueOnce({ ...result('a', 'New library'), libraryEpoch: 8 });
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  view.state.tracksById = new Map();
  await flush();
  expect(workflow.refreshPlaylists).toHaveBeenCalledOnce();
  view.state.collection = { ...collection(), releaseLibraryEpoch: 8 };
  await flush();
  listing.resolve();
  await flush();
  expect(textContent(view.root)).toContain('New library');
  expect(textContent(view.root)).not.toContain('Old library');
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'ready' }),
  );
  view.app.unmount();
});

it('bounds conflict recovery when refreshing the same revision rebuilds the track Map', async () => {
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Old'))
    .mockResolvedValue({ status: 'conflict' });
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  let refreshes = 0;
  workflow.refreshPlaylists.mockImplementation(async () => {
    // Real usePlaylists -> album-cover enrichment rebuilds this Map even
    // when the collection revision and all track values stay the same.
    if (++refreshes < 4) view.state.tracksById = new Map();
  });
  view.state.tracksById = new Map();
  await flush();
  expect(workflow.refreshPlaylists).toHaveBeenCalledOnce();
  expect(getReleaseCatalog).toHaveBeenCalledTimes(3);
  expect(sourceTable(view)).toBeUndefined();
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error' }),
  );
  view.app.unmount();
});

it('shares revision recovery while unrelated track Maps arrive ahead of the new collection', async () => {
  const listing = deferred();
  workflow.refreshPlaylists.mockReturnValueOnce(listing.promise);
  const getReleaseCatalog = vi
    .fn()
    .mockResolvedValueOnce(result('a', 'Keep through both conflicts'))
    .mockResolvedValueOnce({ status: 'conflict' })
    .mockResolvedValueOnce({ status: 'conflict' })
    .mockResolvedValueOnce({ ...result('a', 'New revision'), revision: 3 });
  vi.stubGlobal('window', { Utawakui: { getReleaseCatalog } });
  const view = mountReactiveCatalog();
  await flush();
  const table = sourceTable(view);
  view.state.tracksById = new Map();
  await flush();
  view.state.tracksById = new Map();
  await flush();
  expect(workflow.refreshPlaylists).toHaveBeenCalledOnce();
  expect(sourceTable(view) === table).toBe(true);
  expect(view.onPreviewAvailability).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'pending' }),
  );
  view.state.collection = { ...collection(), resolvedRelease: { revision: 3 } };
  listing.resolve();
  await flush();
  expect(sourceTable(view) === table).toBe(true);
  expect(textContent(table)).toContain('New revision');
  view.app.unmount();
});
