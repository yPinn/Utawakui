import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  emptyWorksDocument,
  validateWorksDocument,
  loadWorks,
  saveWorks,
  commitWorks,
  createAndLinkWork,
  saveTrackProfile,
  unlinkTrack,
  renameWork,
  getBoundTrackProfile,
  prepareTrackDeletion,
  markTrackMediaDeleted,
  finishTrackDeletion,
} from './organization.js';

const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const other = { kind: 'audio-content-sha256', value: 'b'.repeat(64) };
let dir;
const create = (revision = 0) =>
  createAndLinkWork(dir, {
    expectedRevision: revision,
    title: ' RASEN 🎵 ',
    aliases: ['螺旋'],
    tracks: [
      { trackId: 'one', binding, relationship: 'original' },
      {
        trackId: 'two',
        binding: other,
        relationship: 'cover',
        versionInfo: { arrangement: 'acoustic', performance: 'live' },
      },
    ],
  });
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/works-test-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('works store and atomic operations', () => {
  it('persists bounded multiline version notes with canonical LF line endings', () => {
    create();
    saveTrackProfile(dir, {
      expectedRevision: 1,
      trackId: 'one',
      binding,
      versionInfo: { note: ' 合作歌手：Guest\r\n台北場錄音\n現場版 ' },
    });
    expect(loadWorks(dir).trackProfiles.one.versionInfo.note).toBe(
      '合作歌手：Guest\n台北場錄音\n現場版',
    );
    const before = fs.readFileSync(path.join(dir, 'works.json'), 'utf8');
    for (const note of [
      'bad\u0000note',
      'bad\tnote',
      'bad\rnote',
      'bad\u007fnote',
      'x'.repeat(501),
    ]) {
      expect(() =>
        saveTrackProfile(dir, {
          expectedRevision: 2,
          trackId: 'one',
          binding,
          versionInfo: { note },
        }),
      ).toThrow();
    }
    expect(() =>
      saveTrackProfile(dir, {
        expectedRevision: 2,
        trackId: 'one',
        binding,
        versionInfo: { label: 'bad\nlabel' },
      }),
    ).toThrow();
    expect(fs.readFileSync(path.join(dir, 'works.json'), 'utf8')).toBe(before);
  });
  it('unlinks and updates version in one commit, and requires explicit binding reconfirmation', () => {
    create();
    expect(() =>
      saveTrackProfile(dir, {
        expectedRevision: 1,
        trackId: 'one',
        binding: other,
        workLink: null,
      }),
    ).toThrow();
    const document = saveTrackProfile(dir, {
      expectedRevision: 1,
      trackId: 'one',
      binding: other,
      workLink: null,
      versionInfo: { label: 'Live' },
      reconfirm: true,
    });
    expect(document.revision).toBe(2);
    expect(document.trackProfiles.one).toMatchObject({
      binding: other,
      versionInfo: { label: 'Live' },
    });
    expect(document.trackProfiles.one.workLink).toBeUndefined();
  });
  it('requires explicit CAS for internal document persistence', () => {
    const document = create();
    expect(() => saveWorks(dir, document)).toThrow();
    expect(() => saveWorks(dir, document, 1)).toThrow();
    expect(loadWorks(dir).revision).toBe(1);
  });
  it('preserves omitted work fields when renaming and rejects null optional fields', () => {
    const document = create();
    const workId = Object.keys(document.works)[0];
    const renamed = renameWork(dir, {
      expectedRevision: 1,
      workId,
      title: 'New',
    });
    expect(renamed.works[workId].aliases).toEqual(['螺旋']);
    expect(() =>
      createAndLinkWork(dir, {
        expectedRevision: 2,
        title: 'Other',
        aliases: null,
        tracks: [{ trackId: 'three', binding }],
      }),
    ).toThrow();
    expect(() =>
      saveTrackProfile(dir, {
        expectedRevision: 2,
        trackId: 'one',
        binding,
        versionInfo: { arrangement: null },
      }),
    ).toThrow();
  });
  it('returns a fresh empty document without creating a file', () => {
    expect(loadWorks(dir)).toEqual(emptyWorksDocument());
    expect(fs.readdirSync(dir)).toEqual([]);
    const first = emptyWorksDocument();
    first.works.foo = {};
    expect(emptyWorksDocument().works).toEqual({});
  });
  it.each(['{bad', '{"version":2}', '{"version":1,"revision":0}', 'null'])(
    'preserves unreadable/unsupported data: %s',
    (raw) => {
      fs.writeFileSync(path.join(dir, 'works.json'), raw);
      expect(() => loadWorks(dir)).toThrow();
      expect(() => create()).toThrow();
      expect(fs.readFileSync(path.join(dir, 'works.json'), 'utf8')).toBe(raw);
      expect(fs.readdirSync(dir)).toEqual(['works.json']);
    },
  );
  it('does not treat permission or directory reads as empty', () => {
    fs.mkdirSync(path.join(dir, 'works.json'));
    expect(() => loadWorks(dir)).toThrow();
  });
  it('creates and links two recordings in one durable write, retaining independent versions', () => {
    const sync = vi.spyOn(fs, 'fsyncSync');
    const result = create();
    expect(sync).toHaveBeenCalledOnce();
    expect(result.revision).toBe(1);
    const workId = Object.keys(result.works)[0];
    expect(result.works[workId].title).toBe('RASEN 🎵');
    expect(result.trackProfiles.one.workLink).toEqual({
      workId,
      relationship: 'original',
    });
    expect(result.trackProfiles.two.versionInfo).toMatchObject({
      arrangement: 'acoustic',
      performance: 'live',
    });
    expect(loadWorks(dir)).toEqual(result);
    expect(() => create(0)).toThrow(
      expect.objectContaining({ code: 'WORKS_STALE' }),
    );
  });
  it('stores versions without a work, unlinks without losing versions and relinks only one track', () => {
    let doc = saveTrackProfile(dir, {
      expectedRevision: 0,
      trackId: 'one',
      binding,
      versionInfo: { label: ' Demo ' },
    });
    expect(doc.trackProfiles.one.workLink).toBeUndefined();
    doc = create(1);
    const originalWork = Object.keys(doc.works)[0];
    doc = unlinkTrack(dir, {
      expectedRevision: 2,
      trackId: 'two',
      binding: other,
    });
    expect(doc.trackProfiles.two.workLink).toBeUndefined();
    expect(doc.trackProfiles.two.versionInfo.arrangement).toBe('acoustic');
    doc = createAndLinkWork(dir, {
      expectedRevision: 3,
      title: 'Other',
      tracks: [{ trackId: 'two', binding: other }],
    });
    expect(doc.trackProfiles.one.workLink.workId).toBe(originalWork);
    expect(doc.trackProfiles.two.workLink.workId).not.toBe(originalWork);
    doc = renameWork(dir, {
      expectedRevision: 4,
      workId: originalWork,
      title: '修正',
      aliases: [],
      note: 'note',
    });
    expect(doc.works[originalWork].title).toBe('修正');
    expect(doc.trackProfiles.one).not.toHaveProperty('title');
    expect(getBoundTrackProfile(doc, 'one', binding)).toEqual(
      doc.trackProfiles.one,
    );
    expect(getBoundTrackProfile(doc, 'one', other)).toBeNull();
    expect(getBoundTrackProfile(doc, 'one', null)).toBeNull();
  });
  it('does not silently accept reused IDs or unknown work references', () => {
    create();
    expect(() =>
      saveTrackProfile(dir, {
        expectedRevision: 1,
        trackId: 'one',
        binding: other,
        versionInfo: { label: 'oops' },
      }),
    ).toThrow(expect.objectContaining({ code: 'WORKS_BINDING_MISMATCH' }));
    expect(() =>
      saveTrackProfile(dir, {
        expectedRevision: 1,
        trackId: 'one',
        binding,
        workLink: { workId: 'absent', relationship: 'cover' },
      }),
    ).toThrow();
    expect(() =>
      unlinkTrack(dir, { expectedRevision: 1, trackId: 'absent', binding }),
    ).toThrow();
    expect(() =>
      renameWork(dir, { expectedRevision: 1, workId: 'absent', title: 'x' }),
    ).toThrow();
  });
  it('keeps original bytes if writing, fsync or rename fails', () => {
    create();
    const old = fs.readFileSync(path.join(dir, 'works.json'), 'utf8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' });
    });
    expect(() =>
      commitWorks(dir, 1, (doc) => {
        doc.works[Object.keys(doc.works)[0]].title = 'changed';
      }),
    ).toThrow('denied');
    expect(fs.readFileSync(path.join(dir, 'works.json'), 'utf8')).toBe(old);
    rename.mockRestore();
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw new Error('disk');
    });
    expect(() => saveWorks(dir, { ...loadWorks(dir), revision: 2 }, 1)).toThrow(
      'disk',
    );
    expect(fs.readFileSync(path.join(dir, 'works.json'), 'utf8')).toBe(old);
  });
  it.each([
    null,
    [],
    { ...emptyWorksDocument(), extra: 1 },
    { ...emptyWorksDocument(), revision: -1 },
    JSON.parse(
      '{"version":1,"revision":0,"works":{"__proto__":{}},"trackProfiles":{},"pendingTrackDeletions":{}}',
    ),
  ])('strictly rejects invalid document shape %#', (doc) => {
    expect(() => validateWorksDocument(doc)).toThrow();
  });
  it.each([
    { title: '' },
    { title: 'a'.repeat(201) },
    { title: 'x\n' },
    { title: 3 },
    { aliases: Array(17).fill('a') },
    { tracks: [] },
    { tracks: [{ trackId: '__proto__', binding }] },
    {
      tracks: [
        { trackId: 'one', binding, versionInfo: { arrangement: 'invalid' } },
      ],
    },
    {
      tracks: [
        { trackId: 'one', binding, versionInfo: { label: 'a'.repeat(121) } },
      ],
    },
    { tracks: [{ trackId: 'one', binding, versionInfo: { path: 'private' } }] },
    { tracks: [{ trackId: 'one', binding, relationship: 'guess' }] },
  ])('rejects unbounded or unknown mutation fields %#', (overrides) => {
    expect(() =>
      createAndLinkWork(dir, {
        expectedRevision: 0,
        title: 'ok',
        tracks: [{ trackId: 'one', binding }],
        ...overrides,
      }),
    ).toThrow();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  it('validates large documents and rejects dangling references and oversized files', () => {
    const doc = emptyWorksDocument();
    for (let i = 0; i < 10000; i++)
      doc.trackProfiles[`track-${i}`] = {
        binding,
        versionInfo: {
          arrangement: 'unspecified',
          performance: 'unspecified',
          vocal: 'unspecified',
          label: '',
          note: '',
        },
      };
    expect(Object.keys(validateWorksDocument(doc).trackProfiles)).toHaveLength(
      10000,
    );
    doc.trackProfiles['track-0'].workLink = {
      workId: 'missing',
      relationship: 'unknown',
    };
    expect(() => validateWorksDocument(doc)).toThrow();
    const oversized = vi
      .spyOn(fs, 'statSync')
      .mockReturnValue({ size: 32 * 1024 * 1024 });
    expect(() => loadWorks(dir)).toThrow();
    oversized.mockRestore();
  });
});

describe('durable deletion receipts', () => {
  it('does not project an acknowledged deletion even if a resolver still reports old media', () => {
    create();
    const prepared = prepareTrackDeletion(dir, {
      expectedRevision: 1,
      trackId: 'one',
      binding,
    });
    const operationId = Object.keys(prepared.pendingTrackDeletions)[0];
    const marked = markTrackMediaDeleted(dir, {
      expectedRevision: 2,
      operationId,
    });
    expect(getBoundTrackProfile(marked, 'one', binding)).toBeNull();
  });
  it('persists phases and only removes the original bound profile, retaining work', () => {
    const doc = create();
    const result = prepareTrackDeletion(dir, {
      expectedRevision: 1,
      trackId: 'one',
      binding,
    });
    const operationId = Object.keys(result.pendingTrackDeletions)[0];
    expect(result.pendingTrackDeletions[operationId].phase).toBe('prepared');
    expect(() =>
      prepareTrackDeletion(dir, {
        expectedRevision: 2,
        trackId: 'one',
        binding,
      }),
    ).toThrow();
    const marked = markTrackMediaDeleted(dir, {
      expectedRevision: 2,
      operationId,
    });
    expect(marked.pendingTrackDeletions[operationId].phase).toBe(
      'media-deleted',
    );
    const finished = finishTrackDeletion(dir, {
      expectedRevision: 3,
      operationId,
    });
    expect(finished.trackProfiles.one).toBeUndefined();
    expect(finished.trackProfiles.two).toBeDefined();
    expect(finished.works).toEqual(doc.works);
    expect(finished.pendingTrackDeletions).toEqual({});
    const same = finishTrackDeletion(dir, { expectedRevision: 4, operationId });
    expect(same.revision).toBe(4);
  });
});
