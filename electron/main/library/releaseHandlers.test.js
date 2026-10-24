import { describe, expect, it, vi } from 'vitest';
import { registerLibraryReleaseHandlers } from './releaseHandlers.js';

const info = () => ({
  status: 'ok',
  libraryEpoch: 2,
  release: {
    id: 'release-a',
    name: 'Single',
    revision: 3,
    sourceBacked: false,
    effective: {
      type: 'single',
      date: { value: '2026', precision: 'year' },
      totalTrackCount: 1,
      provenance: { type: 'manual' },
      conflicts: [],
    },
    overrides: { type: 'single' },
    sourceValues: {},
    leadTrackId: null,
    memberTrackIds: ['song'],
    memberCount: 1,
    members: [{ trackId: 'song', bindingStatus: 'current' }],
    hasMore: false,
    nextOffset: null,
    requiresMembershipVerification: true,
  },
});
function setup(overrides = {}) {
  const handlers = new Map();
  const runtime = Object.fromEntries(
    ['get', 'save', 'create', 'forTrack', 'resolveMembers'].map((key) => [
      key,
      vi.fn(async () => info()),
    ]),
  );
  Object.assign(runtime, overrides);
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  registerLibraryReleaseHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    runtime,
    recordDiagnostic,
  });
  return { handlers, runtime, recordDiagnostic };
}
const save = () => ({
  collectionId: 'release-a',
  expectedRevision: 3,
  libraryEpoch: 2,
  set: { type: 'single' },
  remove: [],
});
describe('release Main intents', () => {
  it('registers five fixed offline operations', async () => {
    const view = setup();
    expect([...view.handlers.keys()]).toEqual([
      'library:get-release-info',
      'library:save-release-info',
      'library:create-local-release',
      'library:get-track-releases',
      'library:resolve-release-members',
    ]);
    await view.handlers.get('library:save-release-info')(null, save());
    expect(view.runtime.save).toHaveBeenCalledWith(save());
  });
  it.each([
    ['library:get-release-info', { collectionId: '../private' }],
    ['library:get-release-info', { collectionId: 'a', offset: 5001 }],
    ['library:save-release-info', { ...save(), source: { id: 'private' } }],
    [
      'library:save-release-info',
      { ...save(), set: { date: { value: '2026-02-30', precision: 'day' } } },
    ],
    [
      'library:save-release-info',
      { ...save(), set: { type: 'single' }, remove: ['type'] },
    ],
    ['library:save-release-info', { ...save(), set: { type: 'nonsense' } }],
    [
      'library:save-release-info',
      { ...save(), reconfirmTrackIds: ['song', 'song'] },
    ],
    ['library:save-release-info', { ...save(), initializeBindings: 'yes' }],
    ['library:create-local-release', { trackId: 'song', name: 'Single' }],
    [
      'library:create-local-release',
      { trackId: 'song', name: 'Single', libraryEpoch: 2, binding: 'private' },
    ],
    ['library:get-track-releases', { trackId: 'song', limit: 51 }],
    ['library:get-track-releases', { trackId: 'song', offset: 501 }],
    ['library:get-track-releases', { trackId: 'song', offset: -1 }],
    ['library:save-release-info', { ...save(), expectedRevision: -1 }],
    ['library:save-release-info', { ...save(), libraryEpoch: 1.5 }],
    ['library:save-release-info', { ...save(), leadTrackId: '../song' }],
    [
      'library:save-release-info',
      { ...save(), reconfirmTrackIds: ['../song'] },
    ],
    ['library:save-release-info', { ...save(), remove: ['date', 'date'] }],
    ['library:save-release-info', { ...save(), remove: ['source'] }],
    ['library:save-release-info', { ...save(), set: [] }],
    ['library:save-release-info', { ...save(), set: { totalTrackCount: 0 } }],
    [
      'library:create-local-release',
      { trackId: 'song', name: '  ', libraryEpoch: 2 },
    ],
    [
      'library:create-local-release',
      { trackId: 'song', name: 'Title\nPrivate', libraryEpoch: 2 },
    ],
    [
      'library:resolve-release-members',
      { collectionId: 'a', expectedRevision: 3, libraryEpoch: 2, limit: 101 },
    ],
  ])('rejects invalid or privileged input for %s', async (channel, intent) => {
    const view = setup();
    await expect(view.handlers.get(channel)(null, intent)).resolves.toEqual({
      status: 'invalid-intent',
    });
    for (const call of Object.values(view.runtime))
      expect(call).not.toHaveBeenCalled();
  });
  it('drops private fields from snapshots, nested dates, members and source values', async () => {
    const result = info();
    Object.assign(result.release, { localMemberBindings: { song: 'private' } });
    result.release.effective.date.binding = 'private';
    result.release.members[0].binding = 'private';
    result.release.sourceValues = {
      date: { value: '2025', precision: 'year', sourcePath: 'private' },
    };
    const view = setup({ get: vi.fn(async () => result) });
    const projected = await view.handlers.get('library:get-release-info')(
      null,
      { collectionId: 'release-a' },
    );
    expect(projected.release.effective.type).toBe('single');
    expect(JSON.stringify(projected)).not.toContain('private');
  });
  it('projects verified member and multiple release queries', async () => {
    const view = setup({
      forTrack: vi.fn(async () => ({
        status: 'ok',
        libraryEpoch: 2,
        releases: [
          {
            id: 'a',
            name: 'A',
            type: 'single',
            date: null,
            revision: 1,
            binding: 'private',
          },
        ],
      })),
      resolveMembers: vi.fn(async () => ({
        status: 'ok',
        libraryEpoch: 2,
        collectionId: 'a',
        revision: 1,
        members: [
          { trackId: 'song', bindingStatus: 'current', binding: 'private' },
        ],
        playableTrackIds: ['song'],
        hasMore: false,
        nextOffset: null,
        sourcePath: 'private',
      })),
    });
    const matches = await view.handlers.get('library:get-track-releases')(
      null,
      { trackId: 'song' },
    );
    const resolved = await view.handlers.get('library:resolve-release-members')(
      null,
      { collectionId: 'a', libraryEpoch: 2, expectedRevision: 1 },
    );
    expect(matches.releases[0].id).toBe('a');
    expect(resolved.playableTrackIds).toEqual(['song']);
    expect(JSON.stringify([matches, resolved])).not.toContain('private');
  });
  it.each([
    ['RELEASE_INFO_CONFLICT', 'conflict'],
    ['RELEASE_SCOPE_STALE', 'stale'],
    ['RELEASE_NOT_FOUND', 'not-found'],
    ['RELEASE_INFO_INVALID', 'invalid-intent'],
    ['RELEASE_BINDING_MISMATCH', 'binding-mismatch'],
  ])('projects expected %s without diagnostics', async (code, status) => {
    const view = setup({
      save: vi.fn(async () => {
        throw Object.assign(new Error('private'), { code });
      }),
    });
    await expect(
      view.handlers.get('library:save-release-info')(null, save()),
    ).resolves.toEqual({ status });
    expect(view.recordDiagnostic).not.toHaveBeenCalled();
  });
  it('keeps unexpected operational context in Main diagnostics', async () => {
    const view = setup({
      get: vi.fn(async () => {
        throw new Error('C:/private/file');
      }),
    });
    await expect(
      view.handlers.get('library:get-release-info')(null, {
        collectionId: 'a',
      }),
    ).rejects.toThrow('RELEASE_ORGANIZATION_FAILED');
    expect(view.recordDiagnostic).toHaveBeenCalledOnce();
  });
});
