import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTagWritebackService } from './runtime.js';
import { digest } from '../reconciliation/documents.js';
import { inspectFlac, editFlacComments } from './flac.js';
import { tagContentAliases } from './aliases.js';
import crypto from 'node:crypto';
import { importLocalAudioFiles } from '../library/importLocal.js';
import { essence } from './ledger.js';
import { parseBuffer } from 'music-metadata';
import { commitTagFile } from './transaction.js';
import { createReconciliationService } from '../reconciliation/runtime.js';
import { recoverReconciliations } from '../../main/reconciliationHandlers.js';
const roots = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});
function fixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.resolve('.tmp/tags-service-'));
  roots.push(dir);
  fs.mkdirSync(path.join(dir, 'tracks/t'), { recursive: true });
  const source = fs.readFileSync('scripts/fixtures/tags/tone.flac');
  fs.writeFileSync(path.join(dir, 'tracks/t/audio.flac'), source);
  const save = (name, data) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  save('library.json', {
    version: 2,
    tracks: {
      t: {
        title: '新標題',
        artist: '藝人',
        contentHash: digest(source),
        titleOrigin: 'manual',
      },
    },
  });
  const album = (id) => ({
    id,
    kind: 'album',
    name: id,
    trackIds: ['t'],
    releaseInfo: {
      revision: 1,
      observed: {},
      overrides: {
        type: 'album',
        date: { value: '2024-10', precision: 'month' },
        totalTrackCount: 12,
      },
      localMemberBindings: {
        t: { kind: 'audio-content-sha256', value: digest(source) },
      },
    },
  });
  save('playlists.json', {
    version: 4,
    playlists: [album('one'), album('two')],
  });
  let epoch = 1,
    busy = false;
  const service = createTagWritebackService({
    getDirectory: () => ({ dir, epoch }),
    isBusy: () => busy,
    ...overrides,
  });
  service.activity({ trackIds: [] });
  return {
    dir,
    source,
    service,
    save,
    setEpoch: () => epoch++,
    setBusy: (value) => (busy = value),
    read: (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
  };
}
describe('Main-owned FLAC writeback workflow', () => {
  it('requires a primary choice, previews exact fields and changes only selected tags', async () => {
    const f = fixture();
    const options = await f.service.options({ trackId: 't' });
    expect(options.releases).toHaveLength(2);
    expect(Object.keys(options.values)).toEqual(['title', 'artist']);
    expect(JSON.stringify(options)).not.toContain(f.dir);
    const p = await f.service.preview({
      trackId: 't',
      collectionId: 'two',
      position: 1,
      fields: ['title', 'album', 'releaseDate', 'trackNumber', 'trackTotal'],
    });
    expect(p.fields.find((v) => v.field === 'album').after).toBe('two');
    const done = await f.service.commit({ previewId: p.previewId });
    expect(done.status).toBe('saved');
    const after = inspectFlac(
        fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac')),
      ),
      before = inspectFlac(f.source);
    expect(after.audio).toEqual(before.audio);
    expect(after.comments).toContain('TITLE=新標題');
    expect(after.comments).toContain('ALBUM=two');
    expect(after.comments).toContain(
      before.comments.find((v) => v.toUpperCase().startsWith('ARTIST=')),
    );
    expect(after.comments).toContain('X-UTWK-CUSTOM=keep-me');
    expect(after.comments).toContain('REPLAYGAIN_TRACK_GAIN=-7.12 dB');
    const newHash = f.read('library.json').tracks.t.contentHash;
    expect(await tagContentAliases(f.dir, 't', newHash)).toContain(
      digest(f.source),
    );
    const sourceDir = fs.mkdtempSync(path.resolve('.tmp/tags-original-'));
    roots.push(sourceDir);
    const sourceFile = path.join(sourceDir, 'original.flac');
    fs.writeFileSync(sourceFile, f.source);
    const reimport = await importLocalAudioFiles(f.dir, [sourceFile]);
    expect(reimport.imported).toHaveLength(0);
    expect(reimport.skipped[0]).toMatchObject({
      reason: 'duplicate-content',
      existingTrackId: 't',
    });
    expect(newHash).not.toBe(digest(f.source));
    expect(
      f.read('playlists.json').playlists[0].releaseInfo.localMemberBindings.t
        .value,
    ).toBe(newHash);
    expect(f.read('tag-writebacks.json').receipts[0].beforeHash).toBe(
      digest(f.source),
    );
    expect((await f.service.options({ trackId: 't' })).history).toHaveLength(1);
    await f.service.restore({ receiptId: done.receiptId });
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      f.source,
    );
    expect(f.read('library.json').tracks.t.title).toBe('新標題');
  });
  it('rejects album writes without a choice and unsupported fields', async () => {
    const f = fixture();
    await expect(
      f.service.preview({ trackId: 't', fields: ['album'] }),
    ).rejects.toThrow();
    await expect(
      f.service.preview({ trackId: 't', fields: ['cover'] }),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(f.dir, 'tag-writebacks.json'))).toBe(false);
  });
  it.each(['metadata', 'audio', 'epoch'])(
    'refuses a preview after %s changes',
    async (cause) => {
      const f = fixture(),
        p = await f.service.preview({ trackId: 't', fields: ['title'] });
      if (cause === 'metadata')
        f.save('library.json', {
          version: 2,
          tracks: { t: { title: 'External' } },
        });
      if (cause === 'audio')
        fs.appendFileSync(
          path.join(f.dir, 'tracks/t/audio.flac'),
          'external bytes',
        );
      if (cause === 'epoch') f.setEpoch();
      await expect(
        f.service.commit({ previewId: p.previewId }),
      ).rejects.toThrow();
      expect(fs.existsSync(path.join(f.dir, 'tag-writebacks.json'))).toBe(
        false,
      );
    },
  );
  it('queues active media, supports cancellation and retries after release', async () => {
    const progress = vi.fn(),
      f = fixture({ onProgress: progress }),
      p = await f.service.preview({ trackId: 't', fields: ['title'] });
    f.service.activity({ trackIds: ['t'] });
    const outcome = f.service
      .commit({ previewId: p.previewId })
      .catch((error) => error);
    await vi.waitFor(() =>
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'waiting' }),
      ),
    );
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      f.source,
    );
    f.service.cancel();
    expect(await outcome).toMatchObject({ code: 'RECONCILIATION_CANCELLED' });
    const retry = f.service.commit({ previewId: p.previewId });
    f.service.activity({ trackIds: [] });
    expect((await retry).status).toBe('saved');
  });
  it('waits for a heavy processing job before staging', async () => {
    const progress = vi.fn(),
      f = fixture({ onProgress: progress }),
      p = await f.service.preview({ trackId: 't', fields: ['title'] });
    f.setBusy(true);
    const pending = f.service.commit({ previewId: p.previewId });
    await vi.waitFor(() =>
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'waiting' }),
      ),
    );
    f.setBusy(false);
    expect((await pending).status).toBe('saved');
  });
  it('does not undo over an externally replaced file', async () => {
    const f = fixture(),
      p = await f.service.preview({ trackId: 't', fields: ['title'] });
    const done = await f.service.commit({ previewId: p.previewId });
    fs.appendFileSync(path.join(f.dir, 'tracks/t/audio.flac'), 'replacement');
    expect(
      await tagContentAliases(
        f.dir,
        't',
        f.read('library.json').tracks.t.contentHash,
      ),
    ).toEqual([]);
    await expect(
      f.service.restore({ receiptId: done.receiptId }),
    ).rejects.toThrow();
  });
  it('reserves restoration capacity after the hundredth normal write', async () => {
    const f = fixture();
    f.save('tag-writebacks.json', {
      version: 1,
      receipts: Array.from({ length: 99 }, () => {
        const id = crypto.randomUUID();
        return {
          id,
          backupId: id,
          trackId: 't',
          beforeHash: digest(f.source),
          afterHash: digest(f.source),
          essence: essence(f.source),
          createdAt: new Date().toISOString(),
          fields: ['title'],
          collectionId: null,
          position: null,
        };
      }),
    });
    const p = await f.service.preview({ trackId: 't', fields: ['title'] });
    const done = await f.service.commit({ previewId: p.previewId });
    expect(f.read('tag-writebacks.json').receipts).toHaveLength(100);
    expect(
      (await f.service.restore({ receiptId: done.receiptId })).status,
    ).toBe('saved');
    expect(f.read('tag-writebacks.json').receipts).toHaveLength(101);
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      f.source,
    );
  });
  it('round-trips the common album-artist alias and preserves unselected packed track/disc totals', async () => {
    const f = fixture();
    const source = editFlacComments(f.source, {
      'ALBUM ARTIST': ['Old album artist'],
      TRACKNUMBER: ['2/12'],
      DISCNUMBER: ['1/3'],
    });
    fs.writeFileSync(path.join(f.dir, 'tracks/t/audio.flac'), source);
    const library = f.read('library.json');
    Object.assign(library.tracks.t, {
      discNumber: 2,
      albumArtist: 'New album artist',
      albumArtistOrigin: 'manual',
    });
    f.save('library.json', library);
    const playlists = f.read('playlists.json');
    playlists.playlists[0].albumArtist = 'New album artist';
    for (const c of playlists.playlists)
      c.releaseInfo.localMemberBindings.t.value = digest(source);
    f.save('playlists.json', playlists);
    const p = await f.service.preview({
      trackId: 't',
      collectionId: 'one',
      position: 1,
      fields: ['albumArtist', 'trackNumber', 'discNumber'],
    });
    expect(p.fields.find((v) => v.field === 'albumArtist').before).toEqual([
      'Old album artist',
    ]);
    await f.service.commit({ previewId: p.previewId });
    const bytes = fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'));
    const { common } = await parseBuffer(bytes, { mimeType: 'audio/flac' });
    expect(common.albumartist).toBe('New album artist');
    expect(common.track).toEqual({ no: 1, of: 12 });
    expect(common.disk).toEqual({ no: 2, of: 3 });
    expect(inspectFlac(bytes).audio).toEqual(inspectFlac(source).audio);
  });
  it('returns saved when a post-commit notification cannot reach a closed window', async () => {
    const f = fixture({
      notifyChanged: () => {
        throw Error('closed window');
      },
    });
    const p = await f.service.preview({ trackId: 't', fields: ['title'] });
    expect((await f.service.commit({ previewId: p.previewId })).status).toBe(
      'saved',
    );
  });
  it('restores a prepared media journal through the outer reconciliation recovery route', async () => {
    const f = fixture(),
      raw = fs.readFileSync(path.join(f.dir, 'library.json'), 'utf8');
    const output = editFlacComments(f.source, { TITLE: ['Recovered tag'] });
    expect(() =>
      commitTagFile(
        f.dir,
        {
          trackId: 't',
          beforeHash: digest(f.source),
          output,
          changes: [{ filename: 'library.json', before: raw, after: raw }],
        },
        {
          afterPhase: (phase) => {
            if (phase === 'prepared') throw Error('sharing failure');
          },
        },
      ),
    ).toThrow();
    const reconciliation = createReconciliationService({
      getDirectory: () => ({ dir: f.dir, epoch: 1 }),
    });
    expect(() => reconciliation.scan()).toThrow();
    expect(
      (await recoverReconciliations(f.service, reconciliation)).recovered,
    ).toBe(true);
    expect((await reconciliation.scan()).status).toBe('ready');
  });
  it('blocks a total-only edit which would leave the unselected number outside the total', async () => {
    const f = fixture(),
      bytes = editFlacComments(f.source, { TRACKNUMBER: ['20/24'] });
    fs.writeFileSync(path.join(f.dir, 'tracks/t/audio.flac'), bytes);
    const playlists = f.read('playlists.json');
    for (const c of playlists.playlists)
      c.releaseInfo.localMemberBindings.t.value = digest(bytes);
    f.save('playlists.json', playlists);
    await expect(
      f.service.preview({
        trackId: 't',
        collectionId: 'one',
        position: 1,
        fields: ['trackTotal'],
      }),
    ).rejects.toMatchObject({ code: 'TAGS_VERIFICATION_FAILED' });
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      bytes,
    );
  });
  it('stages outside the shared lane, rejects double submission and discards an obsolete stage', async () => {
    const f = fixture(),
      p = await f.service.preview({ trackId: 't', fields: ['title'] });
    let release;
    const gate = new Promise((resolve) => (release = resolve)),
      copy = fs.promises.copyFile;
    const spy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockImplementationOnce(async (...args) => {
        await gate;
        return copy(...args);
      });
    const outcome = f.service
      .commit({ previewId: p.previewId })
      .catch((error) => error);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());
    await expect(
      f.service.commit({ previewId: p.previewId }),
    ).rejects.toMatchObject({ code: 'TAGS_BUSY' });
    const { createWorkOrganizationService } =
      await import('../works/service.js');
    const lane = createWorkOrganizationService({
      getLibraryContext: () => ({ dir: f.dir, epoch: 1 }),
      resolveTrack: async () => null,
    });
    await lane.runInLibrary(() => {
      const index = f.read('library.json');
      index.tracks.t.title = 'External edit';
      f.save('library.json', index);
    });
    release();
    expect(await outcome).toMatchObject({ code: 'RECONCILIATION_CONFLICT' });
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      f.source,
    );
    expect(fs.readdirSync(path.join(f.dir, '.utawakui-tags'))).toEqual([]);
  });
  it('honors cancellation during the first async source or backup read', async () => {
    const f = fixture(),
      p = await f.service.preview({ trackId: 't', fields: ['title'] });
    const pending = f.service.commit({ previewId: p.previewId });
    f.service.cancel();
    await expect(pending).rejects.toMatchObject({
      code: 'RECONCILIATION_CANCELLED',
    });
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      f.source,
    );
    const done = await f.service.commit({ previewId: p.previewId });
    const written = fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'));
    const restore = f.service.restore({ receiptId: done.receiptId });
    f.service.cancel();
    await expect(restore).rejects.toMatchObject({
      code: 'RECONCILIATION_CANCELLED',
    });
    expect(fs.readFileSync(path.join(f.dir, 'tracks/t/audio.flac'))).toEqual(
      written,
    );
  });
  it('reports unqualified formats without writing and rejects expired confirmations', async () => {
    let time = 0;
    const f = fixture({ now: () => time });
    const p = await f.service.preview({ trackId: 't', fields: ['title'] });
    time = 11 * 60 * 1000;
    await expect(
      f.service.commit({ previewId: p.previewId }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_EXPIRED' });
    await expect(
      f.service.options({ trackId: '../private' }),
    ).rejects.toThrow();
    fs.renameSync(
      path.join(f.dir, 'tracks/t/audio.flac'),
      path.join(f.dir, 'tracks/t/audio.mp3'),
    );
    expect(await f.service.options({ trackId: 't' })).toMatchObject({
      status: 'ready',
      supported: false,
    });
    expect(fs.existsSync(path.join(f.dir, 'tag-writebacks.json'))).toBe(false);
  });
});
