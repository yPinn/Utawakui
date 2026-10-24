import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkOrganizationRuntime } from './runtime.js';
import { loadWorks, prepareTrackDeletion } from './organization.js';
import { hashAudioFile } from './trackBinding.js';
import { saveIndexEntry } from '../library/metadataIndex.js';
import { importLocalAudioFiles } from '../library/importLocal.js';
import { downloadAudio } from '../downloader.js';
import { findTrackRecord } from '../library/tracks.js';

let dir;
let scope;
let runtime;
let cleanupReferences;
let notifyChanged;
function audio(id, value = id) {
  const target = path.join(dir, 'tracks', id);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'audio.mp3'), value);
  saveIndexEntry(dir, id, { title: `Title ${id}`, artist: 'Singer' });
}
async function save(trackId, selection, extra = {}) {
  const snapshot = await runtime.get({ trackId });
  return runtime.save({
    trackId,
    selection,
    expectedRevision: snapshot.revision,
    libraryEpoch: snapshot.libraryEpoch,
    relationship: 'cover',
    versionInfo: { arrangement: 'acoustic' },
    ...extra,
  });
}
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/works-runtime-'));
  scope = { dir, epoch: 'library-1' };
  cleanupReferences = vi.fn();
  notifyChanged = vi.fn();
  runtime = createWorkOrganizationRuntime({
    getDirectory: () => scope,
    cleanupReferences,
    notifyChanged,
  });
  audio('one');
  audio('two');
  audio('three');
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Main work organization runtime', () => {
  it.each(['unlinked', 'linked'])(
    'preserves distinct titles, performers and version profiles when linking to an %s target and unlinking',
    async (targetState) => {
      saveIndexEntry(dir, 'one', {
        title: '夜航 feat. 合作歌手',
        artist: '歌手甲 & 合作歌手',
      });
      saveIndexEntry(dir, 'two', {
        title: '夜航 Acoustic Live',
        artist: '翻唱歌手乙',
      });
      const source = await save(
        'one',
        { kind: 'none' },
        {
          versionInfo: {
            label: '合作錄音版',
            performance: 'studio',
            note: '保留合作資訊',
          },
        },
      );
      const target = await save(
        'two',
        targetState === 'linked'
          ? { kind: 'new', title: '既有內部作品名' }
          : { kind: 'none' },
        {
          versionInfo: {
            label: '翻唱現場',
            arrangement: 'acoustic',
            performance: 'live',
          },
        },
      );
      const metadata = fs.readFileSync(path.join(dir, 'library.json'), 'utf8');
      const targetProfile = loadWorks(dir).trackProfiles.two;
      const linked = await save(
        'one',
        { kind: 'track', targetTrackId: 'two' },
        { relationship: 'original', versionInfo: source.versionInfo },
      );
      expect(linked.status).toBe('ok');
      expect(linked.versionInfo).toEqual(source.versionInfo);
      expect((await runtime.get({ trackId: 'two' })).versionInfo).toEqual(
        target.versionInfo,
      );
      if (targetState === 'linked') expect(linked.work).toEqual(target.work);
      expect(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).toBe(
        metadata,
      );
      const detached = await save(
        'one',
        { kind: 'none' },
        { versionInfo: source.versionInfo },
      );
      expect(detached.work).toBeNull();
      expect(detached.versionInfo).toEqual(source.versionInfo);
      expect((await runtime.get({ trackId: 'two' })).work.id).toBe(
        linked.work.id,
      );
      expect(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).toBe(
        metadata,
      );
      if (targetState === 'linked')
        expect(loadWorks(dir).trackProfiles.two).toEqual(targetProfile);
    },
  );
  it('links only the selected track, resolving its existing work in Main', async () => {
    const existing = await save(
      'two',
      { kind: 'new', title: '同一首歌' },
      { versionInfo: { label: 'Target Live' } },
    );
    const candidates = await runtime.search({
      trackId: 'one',
      query: 'Title two',
    });
    expect(candidates.tracks).toContainEqual({
      id: 'two',
      title: 'Title two',
      artist: 'Singer',
      workId: existing.work.id,
    });
    const result = await save('one', { kind: 'track', targetTrackId: 'two' });
    expect(result.work.id).toBe(existing.work.id);
    expect((await runtime.get({ trackId: 'two' })).versionInfo.label).toBe(
      'Target Live',
    );
    expect((await runtime.get({ trackId: 'three' })).work).toBeNull();
  });
  it('creates a shared work from exactly two unlinked tracks using canonical title', async () => {
    const result = await save('one', { kind: 'track', targetTrackId: 'two' });
    expect(result.work.title).toBe('Title two');
    expect((await runtime.get({ trackId: 'two' })).work.id).toBe(
      result.work.id,
    );
    expect((await runtime.get({ trackId: 'three' })).work).toBeNull();
  });
  it('excludes the current work before applying the candidate limit', async () => {
    await save('one', { kind: 'new', title: '同歌' });
    const document = loadWorks(dir);
    const own = Array.from({ length: 30 }, (_, index) => ({
      id: `member-${index}`,
      title: '同歌',
      artist: 'Singer',
    }));
    for (const track of own)
      document.trackProfiles[track.id] = { ...document.trackProfiles.one };
    fs.writeFileSync(path.join(dir, 'works.json'), JSON.stringify(document));
    const bounded = createWorkOrganizationRuntime({
      getDirectory: () => scope,
      listTracks: () => [
        ...own,
        { id: 'outside', title: '同歌 Acoustic', artist: 'Other' },
      ],
    });
    expect(
      (
        await bounded.search({ trackId: 'one', query: '同歌', limit: 30 })
      ).tracks.map((track) => track.id),
    ).toEqual(['outside']);
  });
  it('rejects changed or missing selected media without creating a link', async () => {
    await save('two', { kind: 'new', title: 'Original target' });
    fs.writeFileSync(
      path.join(dir, 'tracks', 'two', 'audio.mp3'),
      'replacement',
    );
    await expect(
      save('one', { kind: 'track', targetTrackId: 'two' }),
    ).rejects.toMatchObject({ code: 'WORKS_TARGET_CHANGED' });
    await expect(
      save('one', { kind: 'track', targetTrackId: 'missing' }),
    ).rejects.toMatchObject({ code: 'WORKS_NOT_FOUND' });
    await expect(
      save('one', { kind: 'track', targetTrackId: 'one' }),
    ).rejects.toMatchObject({ code: 'WORKS_INVALID' });
    expect((await runtime.get({ trackId: 'one' })).work).toBeNull();
  });
  it('binds the same structured original that canonical playback selects across filename casing', async () => {
    fs.renameSync(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
      path.join(dir, 'tracks', 'one', 'audio.MP3'),
    );
    const played = path.join(dir, 'tracks', 'one', 'audio.flac');
    fs.writeFileSync(played, 'canonical played original');
    expect(findTrackRecord(dir, 'one').audioFilename).toBe('audio.flac');
    await save('one', { kind: 'new', title: 'Work' });
    expect(loadWorks(dir).trackProfiles.one.binding).toEqual(
      await hashAudioFile(played),
    );
    fs.writeFileSync(played, 'replacement of played original');
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      bindingStatus: 'changed',
      work: null,
    });
  });
  it('uses canonical filename ordering for legacy originals too', async () => {
    fs.writeFileSync(path.join(dir, 'legacy.MP3'), 'alternate original');
    const played = path.join(dir, 'legacy.flac');
    fs.writeFileSync(played, 'canonical original');
    const readdir = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation((target, ...args) => {
      const entries = readdir(target, ...args);
      return target === dir
        ? entries.sort((left, right) =>
            String(left.name ?? left).endsWith('MP3')
              ? -1
              : String(right.name ?? right).endsWith('MP3')
                ? 1
                : 0,
          )
        : entries;
    });
    expect(await runtime.inspectBinding('legacy', scope)).toEqual({
      status: 'present',
      binding: await hashAudioFile(played),
    });
  });
  it('ignores legacy-looking directories when selecting original media', async () => {
    fs.mkdirSync(path.join(dir, 'legacy.flac'));
    const played = path.join(dir, 'legacy.mp3');
    fs.writeFileSync(played, 'canonical original');
    expect(await runtime.inspectBinding('legacy', scope)).toEqual({
      status: 'present',
      binding: await hashAudioFile(played),
    });
  });
  it('projects only public fields and does not create works storage on read or admission', async () => {
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      status: 'ok',
      bindingStatus: 'unlinked',
      work: null,
      relationship: 'unknown',
      relatedVersions: [],
    });
    expect(await runtime.runImport({ dir }, () => 'admitted')).toBe('admitted');
    expect(fs.existsSync(path.join(dir, 'works.json'))).toBe(false);
  });
  it('creates a work with two tracks and returns bounded public related versions', async () => {
    const result = await save('one', {
      kind: 'new',
      title: '作品 🎵',
      targetTrackId: 'two',
    });
    expect(result).toMatchObject({
      revision: 1,
      bindingStatus: 'current',
      work: { title: '作品 🎵' },
      relationship: 'cover',
      versionInfo: { arrangement: 'acoustic' },
      relatedVersions: [{ trackId: 'two', relationship: 'unknown' }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /binding"|sha256|\.mp3|pendingTrack/,
    );
    const search = await runtime.search({
      trackId: 'one',
      query: '',
      limit: 1,
    });
    expect(search.works).toEqual([
      { id: result.work.id, title: '作品 🎵', memberCount: 2 },
    ]);
    expect(search.tracks).toEqual([
      {
        id: 'three',
        title: 'Title three',
        artist: 'Singer',
        workId: null,
      },
    ]);
  });
  it('keeps links while editing, removes links atomically with version edits and renames works', async () => {
    const first = await save('one', { kind: 'new', title: 'Work' });
    const kept = await save(
      'one',
      { kind: 'keep' },
      { relationship: 'original' },
    );
    expect(kept.work.id).toBe(first.work.id);
    expect(kept.relationship).toBe('original');
    expect(
      await runtime.rename({
        workId: first.work.id,
        title: 'Renamed',
        expectedRevision: 2,
        libraryEpoch: scope.epoch,
      }),
    ).toMatchObject({ status: 'ok', revision: 3 });
    const unlinked = await save(
      'one',
      { kind: 'none' },
      { versionInfo: { label: 'Demo' } },
    );
    expect(unlinked).toMatchObject({
      work: null,
      versionInfo: { label: 'Demo' },
      relatedVersions: [],
    });
    expect(loadWorks(dir).revision).toBe(4);
    expect(notifyChanged).toHaveBeenCalledTimes(4);
  });
  it('links existing works and never steals an already linked target', async () => {
    const first = await save('one', { kind: 'new', title: 'First' });
    await save('two', { kind: 'existing', workId: first.work.id });
    await expect(
      save('three', { kind: 'new', title: 'Steal', targetTrackId: 'two' }),
    ).rejects.toMatchObject({ code: 'WORKS_TARGET_LINKED' });
    expect(loadWorks(dir).revision).toBe(2);
  });
  it('hides changed audio profiles until explicit reconfirmation', async () => {
    await save('one', { kind: 'new', title: 'First', targetTrackId: 'two' });
    fs.writeFileSync(
      path.join(dir, 'tracks', 'two', 'audio.mp3'),
      'replacement',
    );
    expect(await runtime.get({ trackId: 'two' })).toMatchObject({
      bindingStatus: 'changed',
      work: null,
      versionInfo: { arrangement: 'unspecified' },
    });
    expect((await runtime.get({ trackId: 'one' })).relatedVersions).toEqual([]);
    await expect(save('two', { kind: 'keep' })).rejects.toMatchObject({
      code: 'WORKS_BINDING_MISMATCH',
    });
    const result = await save('two', { kind: 'keep' }, { reconfirm: true });
    expect(result).toMatchObject({
      bindingStatus: 'current',
      work: null,
      relationship: 'unknown',
      versionInfo: { arrangement: 'acoustic' },
    });
  });
  it('reconfirms only the visible unlinked profile and never restores hidden version fields', async () => {
    await save(
      'one',
      { kind: 'new', title: 'Hidden previous work' },
      {
        versionInfo: { arrangement: 'acoustic', label: 'Hidden old label' },
        relationship: 'original',
      },
    );
    fs.writeFileSync(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
      'replacement',
    );
    const visible = await runtime.get({ trackId: 'one' });
    expect(visible).toMatchObject({
      work: null,
      relationship: 'unknown',
      versionInfo: { arrangement: 'unspecified', label: '' },
    });
    const result = await runtime.save({
      trackId: 'one',
      expectedRevision: visible.revision,
      libraryEpoch: visible.libraryEpoch,
      selection: { kind: 'keep' },
      reconfirm: true,
    });
    expect(result).toMatchObject({
      work: null,
      relationship: 'unknown',
      versionInfo: visible.versionInfo,
    });
    expect(loadWorks(dir).trackProfiles.one.workLink).toBeUndefined();
  });
  it('requires an explicit existing selection to link replacement audio to its earlier work', async () => {
    const first = await save('one', { kind: 'new', title: 'Work' });
    fs.writeFileSync(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
      'replacement',
    );
    const result = await save(
      'one',
      { kind: 'existing', workId: first.work.id },
      {
        reconfirm: true,
        relationship: 'cover',
        versionInfo: { label: 'New recording' },
      },
    );
    expect(result).toMatchObject({
      work: { id: first.work.id },
      relationship: 'cover',
      versionInfo: { label: 'New recording', arrangement: 'unspecified' },
    });
  });
  it('rejects stale library epochs and concurrent stale revisions', async () => {
    const command = {
      trackId: 'one',
      expectedRevision: 0,
      libraryEpoch: scope.epoch,
      selection: { kind: 'none' },
    };
    scope = { ...scope, epoch: 'library-3' };
    await expect(runtime.save(command)).rejects.toMatchObject({
      code: 'WORKS_SCOPE_STALE',
    });
    const results = await Promise.allSettled([
      save('one', { kind: 'none' }),
      save('two', { kind: 'none' }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      results.find(({ status }) => status === 'rejected').reason.code,
    ).toBe('WORKS_STALE');
  });
  it('recovers partial deletion before reusing an ID without deleting replacement data', async () => {
    await save('one', { kind: 'new', title: 'First' });
    cleanupReferences.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(runtime.deleteTrack({ trackId: 'one' })).rejects.toThrow(
      'cleanup failed',
    );
    expect(fs.existsSync(path.join(dir, 'tracks', 'one'))).toBe(false);
    expect(Object.values(loadWorks(dir).pendingTrackDeletions)[0].phase).toBe(
      'media-deleted',
    );
    await runtime.runImport({ dir, trackId: 'one' }, () =>
      audio('one', 'replacement'),
    );
    expect(loadWorks(dir).trackProfiles.one).toBeUndefined();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      bindingStatus: 'unlinked',
    });
    expect(cleanupReferences).toHaveBeenCalledTimes(2);
  });
  it('retries deletion when receipt exists but the media is already missing', async () => {
    await save('one', { kind: 'none' });
    cleanupReferences.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(runtime.deleteTrack({ trackId: 'one' })).rejects.toThrow();
    await expect(runtime.deleteTrack({ trackId: 'one' })).resolves.toBe(true);
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
  });
  it('does not clean receipts when the library volume is unavailable', async () => {
    const binding = await hashAudioFile(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
    );
    prepareTrackDeletion(dir, { expectedRevision: 0, trackId: 'one', binding });
    const unavailable = createWorkOrganizationRuntime({
      getDirectory: () => ({ dir: path.join(dir, 'offline'), epoch: 1 }),
      cleanupReferences,
    });
    await expect(unavailable.reconcile()).rejects.toMatchObject({
      code: 'WORKS_UNAVAILABLE',
    });
    expect(cleanupReferences).not.toHaveBeenCalled();
  });
  it('serializes admission against deletion and rejects foreign import directories', async () => {
    let release;
    const deferred = new Promise((resolve) => {
      release = resolve;
    });
    const admitted = runtime.runImport({ dir }, async () => {
      await deferred;
      audio('four');
    });
    const deleted = runtime.deleteTrack({ trackId: 'four' });
    release();
    await admitted;
    expect(await deleted).toBe(true);
    await expect(
      runtime.runImport({ dir: path.dirname(dir) }, () => {}),
    ).rejects.toMatchObject({ code: 'WORKS_STALE' });
  });
  it('paginates all related candidates without hashing the entire work', async () => {
    const first = await save('one', {
      kind: 'new',
      title: 'Work',
      targetTrackId: 'two',
    });
    await save('three', { kind: 'existing', workId: first.work.id });
    const page = await runtime.get({ trackId: 'one', offset: 0, limit: 1 });
    expect(page).toMatchObject({
      relatedCandidateTotal: 2,
      hasMore: true,
      nextOffset: 1,
      relatedVersions: [{ trackId: 'two' }],
    });
    const second = await runtime.get({
      trackId: 'one',
      offset: page.nextOffset,
      limit: 1,
    });
    expect(second).toMatchObject({
      hasMore: false,
      nextOffset: null,
      relatedVersions: [{ trackId: 'three' }],
    });
  });
  it.each([
    null,
    {},
    { trackId: '../one' },
    { trackId: 'one', path: 'private' },
  ])('rejects invalid public reads: %j', async (input) => {
    await expect(runtime.get(input)).rejects.toMatchObject({
      code: 'WORKS_INVALID',
    });
  });
  it.each([0, 51, NaN, '2'])('bounds search limits: %j', async (limit) => {
    await expect(
      runtime.search({ trackId: 'one', query: '', limit }),
    ).rejects.toMatchObject({ code: 'WORKS_INVALID' });
  });
  it('rejects invalid mutation fields and selection-specific fields without writing', async () => {
    for (const extra of [
      { selection: { kind: 'keep', title: 'Ignored' } },
      { selection: { kind: 'none', workId: 'work-invalid' } },
      {
        selection: {
          kind: 'existing',
          workId: 'work-invalid',
          targetTrackId: 'two',
        },
      },
      { relationship: 'invalid' },
      { reconfirm: 'yes' },
      { versionInfo: { arrangement: 'live' } },
    ])
      await expect(save('one', { kind: 'none' }, extra)).rejects.toMatchObject({
        code: 'WORKS_INVALID',
      });
    expect(fs.existsSync(path.join(dir, 'works.json'))).toBe(false);
  });
  it('bounds large candidate searches and supports Unicode matching', async () => {
    const listTracks = vi.fn(() =>
      Array.from({ length: 10000 }, (_, index) => ({
        id: `t${index}`,
        title: '曲目 🎵',
        artist: 'Singer',
      })),
    );
    const bounded = createWorkOrganizationRuntime({
      getDirectory: () => scope,
      listTracks,
    });
    const result = await bounded.search({
      trackId: 'one',
      query: '🎵',
      limit: 50,
    });
    expect(result.tracks).toHaveLength(50);
    expect(JSON.stringify(result)).not.toMatch(/binding|path|sha256/);
  });
  it('ranks close titles, aliases and version names without linking them', async () => {
    const first = await save('one', { kind: 'new', title: '夜航' });
    const bounded = createWorkOrganizationRuntime({
      getDirectory: () => scope,
      listTracks: () => [
        { id: 'one', title: '夜航', artist: 'Singer' },
        { id: 'two', title: '夜航 Acoustic Ver.', artist: 'Singer' },
        { id: 'three', title: '夜航', artist: 'Other singer' },
        { id: 'typo', title: 'Starligt', artist: '' },
        { id: 'unrelated', title: '別首歌', artist: '夜航' },
      ],
    });
    const result = await bounded.search({
      trackId: 'one',
      query: '夜航 Demo',
      limit: 30,
    });
    expect(result.works.map((work) => work.id)).toEqual([first.work.id]);
    expect(result.tracks.map((track) => track.id)).toEqual(['three', 'two']);
    expect(
      (await bounded.search({ trackId: 'one', query: 'Starlight' })).tracks.map(
        (track) => track.id,
      ),
    ).toEqual(['typo']);
    expect((await bounded.get({ trackId: 'two' })).work).toBeNull();
  });
  it('cancels a prepared deletion if its original is still present', async () => {
    await save('one', { kind: 'none' });
    const binding = await hashAudioFile(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
    );
    prepareTrackDeletion(dir, { expectedRevision: 1, trackId: 'one', binding });
    await runtime.reconcile();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(cleanupReferences).not.toHaveBeenCalled();
    expect(loadWorks(dir).trackProfiles.one).toBeDefined();
    expect(await runtime.deleteTrack({ trackId: 'missing' })).toBe(false);
  });
  it('does not reuse an ID when cleanup fails during admission', async () => {
    await save('one', { kind: 'none' });
    cleanupReferences.mockRejectedValue(new Error('cleanup still unavailable'));
    await expect(runtime.deleteTrack({ trackId: 'one' })).rejects.toThrow();
    const finalize = vi.fn();
    await expect(
      runtime.runImport({ dir, trackId: 'one' }, finalize),
    ).rejects.toThrow();
    expect(finalize).not.toHaveBeenCalled();
  });
  it('treats permissions and invalid audio as unavailable while retaining profiles', async () => {
    await save('one', { kind: 'none' });
    const read = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation((target, ...args) => {
      if (target === path.join(dir, 'tracks', 'one'))
        throw Object.assign(new Error('access denied'), { code: 'EACCES' });
      return read(target, ...args);
    });
    await expect(runtime.get({ trackId: 'one' })).rejects.toMatchObject({
      code: 'WORKS_UNAVAILABLE',
    });
    vi.restoreAllMocks();
    fs.writeFileSync(path.join(dir, 'tracks', 'one', 'audio.mp3'), '');
    await expect(runtime.get({ trackId: 'one' })).rejects.toMatchObject({
      code: 'WORKS_UNAVAILABLE',
    });
    expect(loadWorks(dir).trackProfiles.one).toBeDefined();
  });
  it('invalidates in-flight hashing even if a caller has not changed the directory epoch', async () => {
    const open = fs.promises.open;
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      entered();
      await gate;
      return open(...args);
    });
    const request = runtime.get({ trackId: 'one' });
    await started;
    runtime.invalidate();
    release();
    await expect(request).rejects.toMatchObject({ code: 'WORKS_SCOPE_STALE' });
  });
  it('uses the formal local import admission to recover deletion before exact ID reuse', async () => {
    await save('one', { kind: 'none' });
    cleanupReferences.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(runtime.deleteTrack({ trackId: 'one' })).rejects.toThrow();
    const source = path.join(dir, 'incoming', 'one.mp3');
    fs.mkdirSync(path.dirname(source));
    fs.writeFileSync(source, 'new local source');
    const result = await importLocalAudioFiles(dir, [source], {
      readAudioMetadata: async () => ({ title: 'Replacement', duration: 3 }),
      runImport: runtime.runImport,
    });
    expect(result.imported).toEqual([{ id: 'one', title: 'Replacement' }]);
    expect(loadWorks(dir).trackProfiles.one).toBeUndefined();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
  });
  it('edits and deletes a formally imported existing track ID longer than 200 characters', async () => {
    const id = 'x'.repeat(201);
    const source = path.join(dir, 'incoming', `${id}.mp3`);
    fs.mkdirSync(path.dirname(source));
    fs.writeFileSync(source, 'long track id audio');
    const imported = await importLocalAudioFiles(dir, [source], {
      readAudioMetadata: async () => ({ title: 'Long ID', duration: 3 }),
    });
    expect(imported.imported).toEqual([{ id, title: 'Long ID' }]);
    const profile = await save(id, { kind: 'new', title: 'Work' });
    expect(profile).toMatchObject({ trackId: id, work: { title: 'Work' } });
    expect(await runtime.deleteTrack({ trackId: id })).toBe(true);
    expect(fs.existsSync(path.join(dir, 'tracks', id))).toBe(false);
    expect(loadWorks(dir).trackProfiles[id]).toBeUndefined();
  });
  it.each(['constructor', 'prototype', '__proto__'])(
    'deletes existing safe reserved-name media without enabling profile mutation: %s',
    async (id) => {
      const directory = path.join(dir, 'tracks', id);
      fs.mkdirSync(directory);
      fs.writeFileSync(
        path.join(directory, 'audio.mp3'),
        'legacy reserved-name original',
      );
      await expect(runtime.get({ trackId: id })).rejects.toMatchObject({
        code: 'WORKS_INVALID',
      });
      expect(await runtime.deleteTrack({ trackId: id })).toBe(true);
      expect(fs.existsSync(directory)).toBe(false);
      expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
      expect(Object.hasOwn(loadWorks(dir).trackProfiles, id)).toBe(false);
      expect({}.polluted).toBeUndefined();
    },
  );
  it('deletes zero-byte canonical media and recovers cleanup while keeping profile reads strict', async () => {
    fs.writeFileSync(path.join(dir, 'tracks', 'one', 'audio.mp3'), '');
    await expect(runtime.get({ trackId: 'one' })).rejects.toMatchObject({
      code: 'WORKS_UNAVAILABLE',
    });
    cleanupReferences.mockRejectedValueOnce(new Error('cleanup interrupted'));
    await expect(runtime.deleteTrack({ trackId: 'one' })).rejects.toThrow(
      'cleanup interrupted',
    );
    expect(fs.existsSync(path.join(dir, 'tracks', 'one'))).toBe(false);
    expect(
      Object.values(loadWorks(dir).pendingTrackDeletions)[0].binding.value,
    ).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await runtime.deleteTrack({ trackId: 'one' })).toBe(true);
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
  });
  it('rejects a local install invalidated while its final tracks-directory mkdir is pending', async () => {
    const source = path.join(dir, 'incoming', 'late.mp3');
    fs.mkdirSync(path.dirname(source));
    fs.writeFileSync(source, 'late local source');
    const mkdir = fs.promises.mkdir;
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    vi.spyOn(fs.promises, 'mkdir').mockImplementation(
      async (target, ...args) => {
        if (target === path.join(dir, 'tracks')) {
          entered();
          await gate;
        }
        return mkdir(target, ...args);
      },
    );
    const importing = importLocalAudioFiles(dir, [source], {
      readAudioMetadata: async () => ({ title: 'Late', duration: 3 }),
      runImport: runtime.runImport,
    });
    await started;
    scope = { ...scope, epoch: 'library-2' };
    runtime.invalidate();
    release();
    const result = await importing;
    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([
      { filename: 'late.mp3', reason: 'import-failed' },
    ]);
    expect(fs.existsSync(path.join(dir, 'tracks', 'late'))).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).tracks
        .late,
    ).toBeUndefined();
  });
  it('passes a trusted scope assertion into asynchronous acquisition finalizers', async () => {
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const request = runtime.runImport({ dir }, async (assertCurrent) => {
      entered();
      await gate;
      assertCurrent();
      audio('late');
    });
    await started;
    scope = { ...scope, epoch: 'library-2' };
    runtime.invalidate();
    release();
    await expect(request).rejects.toMatchObject({ code: 'WORKS_SCOPE_STALE' });
    expect(fs.existsSync(path.join(dir, 'tracks', 'late'))).toBe(false);
  });
  it('recovers scalar metadata when deletion failed after removing media but before index cleanup', async () => {
    const interrupted = createWorkOrganizationRuntime({
      getDirectory: () => scope,
      cleanupReferences,
      deleteTrack: () => {
        fs.rmSync(path.join(dir, 'tracks', 'one'), { recursive: true });
        throw new Error('index write failed');
      },
    });
    await expect(interrupted.deleteTrack({ trackId: 'one' })).rejects.toThrow(
      'index write failed',
    );
    await interrupted.reconcile();
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).tracks
        .one,
    ).toBeUndefined();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
  });
  it('preserves replacement scalar metadata installed during asynchronous reference cleanup', async () => {
    await save('one', { kind: 'none' });
    cleanupReferences.mockImplementationOnce(async () => {
      await Promise.resolve();
      audio('one', 'replacement');
      saveIndexEntry(dir, 'one', { title: 'Replacement title' });
    });
    expect(await runtime.deleteTrack({ trackId: 'one' })).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).tracks
        .one.title,
    ).toBe('Replacement title');
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      bindingStatus: 'unlinked',
      work: null,
    });
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
  });
  it('rejects a long acquisition from an earlier epoch after switching A to B to A', async () => {
    const capturedEpoch = scope.epoch;
    scope = { dir: path.join(dir, 'other'), epoch: 'library-2' };
    runtime.invalidate();
    scope = { dir, epoch: 'library-3' };
    runtime.invalidate();
    const finalize = vi.fn();
    await expect(
      runtime.runImport({ dir, libraryEpoch: capturedEpoch }, finalize),
    ).rejects.toMatchObject({ code: 'WORKS_SCOPE_STALE' });
    expect(finalize).not.toHaveBeenCalled();
  });
  it('keeps provider index commit inside the same lane as canonical admission', async () => {
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const acquisition = downloadAudio('abc12345678', dir, {
      runner: async (_url, options) => {
        if (options.skipDownload) return {};
        fs.writeFileSync(options.output.replace('%(ext)s', 'mp3'), 'provider');
      },
      runImport: runtime.runImport,
      onTrackCommitted: async () => {
        entered();
        await gate;
        saveIndexEntry(dir, 'abc12345678', { title: 'Provider' });
      },
    });
    await started;
    const removal = runtime.deleteTrack({ trackId: 'abc12345678' });
    release();
    await acquisition;
    expect(await removal).toBe(true);
    expect(fs.existsSync(path.join(dir, 'tracks', 'abc12345678'))).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).tracks
        .abc12345678,
    ).toBeUndefined();
  });
});
