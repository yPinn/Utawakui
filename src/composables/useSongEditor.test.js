import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ confirm: vi.fn(), refresh: vi.fn() }));
vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({ refresh: deps.refresh }),
}));
vi.mock('./useAppConfirmation.js', () => ({
  useAppConfirmation: () => ({ confirm: deps.confirm }),
}));
vi.mock('./useFeatureGateAccess.js', () => ({
  useFeatureGateAccess: () => ({
    requireFeatureGate: vi.fn().mockResolvedValue(false),
  }),
}));
vi.mock('./useFeatureGates.js', () => ({
  useFeatureGates: () => ({
    isFeatureEnabled: () => false,
    refreshConfirmations: vi.fn(),
  }),
}));
const track = {
  id: 'a',
  title: 'Title',
  artist: 'Singer',
  sourceType: 'local-file',
  thumbnailUrl: 'media:art',
};
const snapshot = (extra = {}) => ({
  status: 'ok',
  trackId: 'a',
  libraryEpoch: 1,
  revision: 1,
  bindingStatus: 'current',
  work: null,
  versionInfo: {},
  relationship: 'unknown',
  relatedVersions: [],
  ...extra,
});
let owner, bridge;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  deps.confirm.mockResolvedValue(true);
  deps.refresh.mockResolvedValue();
  bridge = {
    getWorkOrganization: vi.fn().mockResolvedValue(snapshot()),
    searchWorkOrganization: vi.fn().mockResolvedValue({
      status: 'ok',
      libraryEpoch: 1,
      works: [],
      tracks: [],
    }),
    saveWorkOrganization: vi.fn().mockResolvedValue(snapshot({ revision: 2 })),
    renameWork: vi
      .fn()
      .mockResolvedValue({ status: 'ok', libraryEpoch: 1, revision: 3 }),
    saveTrackEdits: vi.fn(async (_id, edit) => ({
      status: 'ok',
      track: { ...track, title: edit.title, artist: edit.artist },
    })),
    discardTrackArtworkDraft: vi.fn().mockResolvedValue(true),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  owner = (await import('./useSongEditor.js')).useSongEditor();
  await owner.open(track);
});
afterEach(() => {
  owner?.dispose();
  vi.unstubAllGlobals();
});
describe('one song editing workspace', () => {
  it('edits current metadata without renaming the work or writing related versions', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot({ work: { id: 'w', title: 'Legacy group title' } }),
    );
    await owner.work.reload();
    owner.metadata.setTitleDraft('Title feat. Guest');
    owner.metadata.setArtistDraft('Singer & Guest');
    expect(await owner.save()).toBe(true);
    expect(bridge.saveTrackEdits).toHaveBeenCalledWith('a', {
      title: 'Title feat. Guest',
      artist: 'Singer & Guest',
      artwork: { action: 'keep' },
    });
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    expect(bridge.renameWork).not.toHaveBeenCalled();
    expect(owner.work.state.snapshot.work.title).toBe('Legacy group title');
    expect(owner.isDirty.value).toBe(false);
  });
  it('does not send stale version writes after metadata save finishes in a different library scope', async () => {
    let resolve;
    bridge.saveTrackEdits.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    owner.metadata.setTitleDraft('Changed');
    owner.work.updateVersion('label', 'Live');
    const saving = owner.save();
    expect(await owner.close()).toBe(false);
    expect(await owner.open({ ...track, id: 'b' })).toBe(false);
    owner.work.dispose();
    await Promise.resolve();
    resolve({ status: 'ok', track: { ...track, title: 'Changed' } });
    expect(await saving).toBe(false);
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    expect(owner.metadata.isOpen.value).toBe(false);
  });
  it('ignores a late version/link response after the work scope is disposed', async () => {
    let resolve;
    bridge.saveWorkOrganization.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    owner.metadata.setTitleDraft('Changed');
    owner.work.select({ kind: 'track', targetTrackId: 'b' });
    const saving = owner.save();
    await vi.waitFor(() =>
      expect(bridge.saveWorkOrganization).toHaveBeenCalledOnce(),
    );
    owner.work.dispose();
    await Promise.resolve();
    resolve(snapshot({ revision: 2 }));
    expect(await saving).toBe(false);
    expect(owner.isOpen.value).toBe(false);
    expect(owner.state.partialMessage).toBe('');
    expect(bridge.renameWork).not.toHaveBeenCalled();
  });
  it('retains both drafts while switching sections and re-opening the same song', async () => {
    owner.metadata.setTitleDraft('Changed');
    owner.work.updateVersion('label', 'Live');
    owner.setSection('organization');
    await owner.open(track);
    expect(owner.metadata.state.titleDraft).toBe('Changed');
    expect(owner.work.state.versionInfo.label).toBe('Live');
    expect(owner.isDirty.value).toBe(true);
    deps.confirm.mockResolvedValueOnce(false);
    expect(await owner.close()).toBe(false);
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(await owner.close()).toBe(true);
    expect(owner.isOpen.value).toBe(false);
  });
  it('saves both domains once, remains open and does not repeat successful writes', async () => {
    owner.metadata.setTitleDraft('Changed');
    owner.work.updateVersion('label', 'Live');
    expect(await owner.save()).toBe(true);
    expect(bridge.saveTrackEdits).toHaveBeenCalledTimes(1);
    expect(bridge.saveWorkOrganization).toHaveBeenCalledTimes(1);
    expect(owner.isOpen.value).toBe(true);
    expect(owner.metadata.isDirty.value).toBe(false);
    expect(owner.work.state.track.title).toBe('Changed');
    await owner.save();
    expect(bridge.saveTrackEdits).toHaveBeenCalledTimes(1);
    expect(bridge.saveWorkOrganization).toHaveBeenCalledTimes(1);
  });
  it('preserves the unfinished version draft after metadata succeeds and retries only that draft', async () => {
    owner.metadata.setTitleDraft('Changed');
    owner.work.updateVersion('label', 'Live');
    bridge.saveWorkOrganization.mockResolvedValueOnce({ status: 'conflict' });
    expect(await owner.save()).toBe(false);
    expect(owner.state.partialMessage).toContain('歌曲資訊已儲存');
    expect(owner.metadata.isDirty.value).toBe(false);
    expect(owner.work.state.versionInfo.label).toBe('Live');
    expect(owner.state.section).toBe('organization');
  });
  it('does not write versions when metadata validation or saving fails', async () => {
    owner.metadata.setTitleDraft('');
    owner.work.updateVersion('note', 'keep');
    expect(await owner.save()).toBe(false);
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    expect(owner.work.state.versionInfo.note).toBe('keep');
    expect(owner.state.section).toBe('metadata');
  });
  it('links and unlinks only by track id without submitting any shared or target metadata', async () => {
    owner.work.select({ kind: 'track', targetTrackId: 'b' });
    owner.work.updateVersion('label', 'Live feat. Guest');
    bridge.saveWorkOrganization.mockResolvedValueOnce(
      snapshot({
        revision: 2,
        work: { id: 'w', title: 'Different title' },
        versionInfo: { label: 'Live feat. Guest' },
      }),
    );
    expect(await owner.save()).toBe(true);
    expect(bridge.saveWorkOrganization).toHaveBeenLastCalledWith({
      trackId: 'a',
      expectedRevision: 1,
      libraryEpoch: 1,
      selection: { kind: 'track', targetTrackId: 'b' },
      relationship: 'unknown',
      versionInfo: {
        arrangement: 'unspecified',
        performance: 'unspecified',
        vocal: 'unspecified',
        label: 'Live feat. Guest',
        note: '',
      },
    });
    owner.work.select({ kind: 'none' });
    expect(await owner.save()).toBe(true);
    expect(bridge.saveWorkOrganization).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trackId: 'a',
        selection: { kind: 'none' },
        versionInfo: expect.objectContaining({ label: 'Live feat. Guest' }),
      }),
    );
    expect(bridge.saveTrackEdits).not.toHaveBeenCalled();
    expect(bridge.renameWork).not.toHaveBeenCalled();
    expect(owner.work.state.track).toEqual(track);
  });
  it('keeps provider metadata read-only and never invokes metadata writes or artwork discovery', async () => {
    await owner.close();
    await owner.open({ ...track, sourceType: 'youtube', thumbnailUrl: '' });
    expect(owner.canEditMetadata.value).toBe(false);
    expect(owner.metadata.state.artworkSearchOpen).toBe(false);
    owner.work.updateVersion('label', 'Live');
    await owner.save();
    expect(bridge.saveTrackEdits).not.toHaveBeenCalled();
  });
});
