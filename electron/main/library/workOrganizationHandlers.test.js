import { describe, expect, it, vi } from 'vitest';
import { registerLibraryWorkOrganizationHandlers } from './workOrganizationHandlers.js';
import { APP_ERROR_PREFIX } from '../../lib/appError.js';

const workId = 'work-12345678-1234-4234-8234-123456789abc';
const snapshot = () => ({
  status: 'ok',
  libraryEpoch: 0,
  revision: 1,
  trackId: 'track-a',
  bindingStatus: 'current',
  relationship: 'original',
  work: { id: workId, title: 'Song', aliases: [], note: '' },
  versionInfo: {
    arrangement: 'acoustic',
    performance: 'live',
    vocal: 'unspecified',
    label: '',
    note: '',
  },
  relatedVersions: [],
  relatedTotal: 0,
  hasMore: false,
  nextOffset: null,
});
function register(overrides = {}) {
  const handlers = new Map();
  const runtime = {
    get: vi.fn(async () => snapshot()),
    search: vi.fn(async () => ({
      status: 'ok',
      libraryEpoch: 0,
      revision: 1,
      works: [],
      tracks: [],
    })),
    save: vi.fn(async () => snapshot()),
    rename: vi.fn(async () => ({ status: 'ok', libraryEpoch: 0, revision: 2 })),
    ...overrides,
  };
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  registerLibraryWorkOrganizationHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    runtime,
    recordDiagnostic,
  });
  return { handlers, runtime, recordDiagnostic };
}
const saveIntent = () => ({
  trackId: 'track-a',
  expectedRevision: 1,
  libraryEpoch: 0,
  selection: { kind: 'existing', workId },
  relationship: 'cover',
  versionInfo: snapshot().versionInfo,
});

describe('work organization Main IPC', () => {
  it.each(['合作歌手：Guest\n台北場錄音', '合作歌手：Guest\r\n台北場錄音'])(
    'accepts version note line breaks without relaxing other text validation: %s',
    async (note) => {
      const { handlers, runtime } = register();
      const handler = handlers.get('library:save-work-organization');
      const intent = {
        ...saveIntent(),
        versionInfo: { ...snapshot().versionInfo, note },
      };
      expect((await handler(null, intent)).status).toBe('ok');
      expect(runtime.save).toHaveBeenCalledWith(intent);
      runtime.save.mockClear();
      for (const invalidNote of [
        'bad\u0000note',
        'bad\tnote',
        'bad\rnote',
        'bad\u007fnote',
        'x'.repeat(501),
      ]) {
        expect(
          await handler(null, {
            ...intent,
            versionInfo: { ...intent.versionInfo, note: invalidNote },
          }),
        ).toEqual({ status: 'invalid-intent' });
      }
      expect(
        await handler(null, {
          ...intent,
          versionInfo: { ...intent.versionInfo, label: 'bad\nlabel' },
        }),
      ).toEqual({ status: 'invalid-intent' });
      expect(
        await handlers.get('library:search-work-organization')(null, {
          trackId: 'track-a',
          query: 'bad\nquery',
        }),
      ).toEqual({ status: 'invalid-intent' });
      expect(runtime.save).not.toHaveBeenCalled();
      expect(runtime.search).not.toHaveBeenCalled();
    },
  );
  it('accepts only a bounded selected-track intent without renderer-supplied work identity', async () => {
    const { handlers, runtime } = register();
    const handler = handlers.get('library:save-work-organization');
    const intent = {
      ...saveIntent(),
      selection: { kind: 'track', targetTrackId: 'track-b' },
    };
    await handler(null, intent);
    expect(runtime.save).toHaveBeenCalledWith(intent);
    runtime.save.mockClear();
    for (const selection of [
      { kind: 'track', targetTrackId: '../private' },
      { kind: 'track', targetTrackId: 'b', workId },
      { kind: 'track', targetTrackId: 'b', title: 'injected' },
      { kind: 'track' },
    ])
      expect(await handler(null, { ...intent, selection })).toEqual({
        status: 'invalid-intent',
      });
    expect(runtime.save).not.toHaveBeenCalled();
  });
  it('registers four fixed local-only operations without requiring a provider gate', async () => {
    const { handlers, runtime } = register();
    expect([...handlers.keys()]).toEqual([
      'library:get-work-organization',
      'library:search-work-organization',
      'library:save-work-organization',
      'library:rename-work',
    ]);
    await handlers.get('library:save-work-organization')(null, saveIntent());
    expect(runtime.save).toHaveBeenCalledWith(saveIntent());
  });

  it.each([
    ['library:get-work-organization', { trackId: '../secret' }],
    ['library:get-work-organization', { trackId: 'a', offset: -1 }],
    [
      'library:search-work-organization',
      { trackId: 'a', query: 'x'.repeat(201) },
    ],
    [
      'library:search-work-organization',
      { trackId: 'a', query: '', limit: 51 },
    ],
    ['library:save-work-organization', { ...saveIntent(), path: 'private' }],
    [
      'library:save-work-organization',
      { ...saveIntent(), binding: { value: 'forged' } },
    ],
    [
      'library:save-work-organization',
      {
        ...saveIntent(),
        selection: { kind: 'new', title: '', targetTrackId: 'b' },
      },
    ],
    [
      'library:save-work-organization',
      {
        ...saveIntent(),
        versionInfo: { ...snapshot().versionInfo, model: 'private' },
      },
    ],
    [
      'library:save-work-organization',
      { ...saveIntent(), relationship: 'guessed-cover' },
    ],
    [
      'library:rename-work',
      { workId, title: 'Song', libraryEpoch: 0, expectedRevision: -1 },
    ],
  ])(
    'rejects malformed %s intent before touching the library',
    async (channel, intent) => {
      const { handlers, runtime } = register();
      await expect(handlers.get(channel)(null, intent)).resolves.toEqual({
        status: 'invalid-intent',
      });
      for (const method of Object.values(runtime))
        expect(method).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['WORKS_STALE', 'conflict'],
    ['WORKS_TARGET_LINKED', 'conflict'],
    ['WORKS_TARGET_CHANGED', 'target-changed'],
    ['WORKS_INVALID', 'invalid-intent'],
    ['WORKS_PENDING_DELETION', 'recovery-pending'],
    ['WORKS_SCOPE_STALE', 'stale'],
    ['WORKS_BINDING_MISMATCH', 'binding-mismatch'],
    ['WORKS_NOT_FOUND', 'not-found'],
  ])(
    'returns bounded expected state for %s without treating it as an operational failure',
    async (code, status) => {
      const { handlers, recordDiagnostic } = register({
        save: vi.fn(async () => {
          throw Object.assign(new Error('private path'), { code });
        }),
      });
      await expect(
        handlers.get('library:save-work-organization')(null, saveIntent()),
      ).resolves.toEqual({ status });
      expect(recordDiagnostic).not.toHaveBeenCalled();
    },
  );

  it('projects local search and rename results without private runtime fields', async () => {
    const view = register({
      search: vi.fn(async () => ({
        status: 'ok',
        libraryEpoch: 2,
        revision: 4,
        binding: 'private',
        works: [
          { id: workId, title: 'Song', memberCount: 1, binding: 'private' },
        ],
        tracks: [
          {
            id: 'track-b',
            title: 'Cover',
            artist: 'Singer',
            workId: null,
            sourcePath: 'private',
          },
        ],
      })),
      rename: vi.fn(async () => ({
        status: 'ok',
        libraryEpoch: 2,
        revision: 5,
        binding: 'private',
      })),
    });
    const search = await view.handlers.get('library:search-work-organization')(
      null,
      { trackId: 'track-a', query: 'Song' },
    );
    expect(search.works[0].memberCount).toBe(1);
    expect(search.tracks[0].id).toBe('track-b');
    expect(JSON.stringify(search)).not.toContain('private');
    await expect(
      view.handlers.get('library:rename-work')(null, {
        workId,
        title: 'Renamed',
        expectedRevision: 4,
        libraryEpoch: 2,
      }),
    ).resolves.toEqual({ status: 'ok', libraryEpoch: 2, revision: 5 });
  });

  it('records original private context and crosses only a bounded public I/O error', async () => {
    const { handlers, recordDiagnostic } = register({
      get: vi.fn(async () => {
        throw new Error('C:/private/source audio');
      }),
    });
    let thrown;
    try {
      await handlers.get('library:get-work-organization')(null, {
        trackId: 'track-a',
      });
    } catch (error) {
      thrown = error;
    }
    expect(recordDiagnostic).toHaveBeenCalledOnce();
    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).not.toContain('C:/private');
  });

  it('does not pass private runtime fields or private nested media data to Renderer', async () => {
    const { handlers } = register({
      get: vi.fn(async () => ({
        ...snapshot(),
        binding: { value: 'private-hash' },
        pendingTrackDeletions: {},
        work: { ...snapshot().work, sourcePath: 'private' },
        relatedVersions: [
          {
            trackId: 'b',
            relationship: 'cover',
            versionInfo: snapshot().versionInfo,
            contentHash: 'private',
          },
        ],
      })),
    });
    const result = await handlers.get('library:get-work-organization')(null, {
      trackId: 'track-a',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|binding"|pendingTrackDeletions|contentHash/,
    );
    expect(result.relatedVersions[0].trackId).toBe('b');
  });
});
