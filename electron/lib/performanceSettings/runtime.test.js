import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerformanceSettingsRuntime } from './runtime.js';
import { hashAudioFile } from '../works/trackBinding.js';
import { createTagWritebackService } from '../tags/runtime.js';
import { digest } from '../reconciliation/documents.js';
const { createWorkOrganizationService } = createRequire(import.meta.url)(
  '../works/service.js',
);

const values = {
  transposeSemitones: 2,
  pitchCents: -15,
  tempoRate: 0.95,
  monitorGuideVocalEnabled: false,
};
let dir, scope, runtime, hash;
const file = () => path.join(dir, 'tracks', 'one', 'performance-settings.json');
const audio = () => path.join(dir, 'tracks', 'one', 'audio.wav');
const intent = (snapshot, data = values) => ({
  trackId: 'one',
  slot: 1,
  token: snapshot.token,
  expectedRevision: snapshot.revision,
  values: data,
});
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'performance-settings-'));
  fs.mkdirSync(path.dirname(audio()), { recursive: true });
  fs.writeFileSync(audio(), 'original audio');
  scope = { dir, epoch: 0 };
  hash = vi.fn(hashAudioFile);
  runtime = createPerformanceSettingsRuntime({
    getDirectory: () => scope,
    hashAudio: hash,
    hasGuide: () => true,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Main performance settings', () => {
  it('verifies the existing source token without rebasing sidecar CAS or writing data', async () => {
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const raw = fs.readFileSync(file(), 'utf8');
    fs.writeFileSync(file(), raw + '\n');
    expect(
      await runtime.verifySource({ trackId: 'one', token: saved.token }),
    ).toEqual({ status: 'equivalent' });
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw + '\n');
    await expect(runtime.save(intent(saved))).rejects.toMatchObject({
      code: 'PERFORMANCE_CONFLICT',
    });
    fs.writeFileSync(audio(), 'different recording');
    await expect(
      runtime.verifySource({ trackId: 'one', token: saved.token }),
    ).rejects.toMatchObject({ code: 'PERFORMANCE_SOURCE_STALE' });
    runtime.cancel({ token: saved.token });
    await expect(
      runtime.verifySource({ trackId: 'one', token: saved.token }),
    ).rejects.toMatchObject({ code: 'PERFORMANCE_STALE' });
  });
  it('keeps the same track id isolated across actual library A→B→A switches', async () => {
    const first = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const original = fs.readFileSync(file(), 'utf8');
    const other = path.join(dir, 'other-library');
    fs.mkdirSync(path.join(other, 'tracks/one'), { recursive: true });
    fs.writeFileSync(
      path.join(other, 'tracks/one/audio.wav'),
      'other recording',
    );
    scope = { dir: other, epoch: 1 };
    runtime.invalidate();
    await expect(runtime.save(intent(first))).rejects.toMatchObject({
      code: 'PERFORMANCE_STALE',
    });
    const missing = await runtime.get({ trackId: 'one' });
    expect(missing.status).toBe('absent');
    await runtime.save(intent(missing, { ...values, transposeSemitones: -5 }));
    expect(fs.readFileSync(file(), 'utf8')).toBe(original);
    scope = { dir, epoch: 2 };
    runtime.invalidate();
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      values,
      revision: first.revision,
    });
  });
  it('keeps three independent slots, selects one default and CAS protects all slots', async () => {
    const first = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const second = await runtime.save({
      ...intent(first, { ...values, transposeSemitones: -3 }),
      slot: 2,
    });
    expect(second.slots).toEqual([
      values,
      { ...values, transposeSemitones: -3 },
      null,
    ]);
    expect(second.defaultSlot).toBe(1);
    const { values: unusedValues, ...selection } = intent(second);
    expect(unusedValues).toEqual(values);
    const selected = await runtime.setDefault({ ...selection, slot: 2 });
    expect(selected.defaultSlot).toBe(2);
    expect(selected.values.transposeSemitones).toBe(-3);
    await expect(
      runtime.save({ ...intent(second), slot: 3 }),
    ).rejects.toMatchObject({ code: 'PERFORMANCE_CONFLICT' });
    await expect(
      runtime.save({ ...intent(selected), slot: 4 }),
    ).rejects.toMatchObject({ code: 'PERFORMANCE_INVALID' });
    const removed = await runtime.remove({
      trackId: 'one',
      token: selected.token,
      expectedRevision: selected.revision,
      slot: 2,
    });
    expect(removed.slots[0]).toEqual(values);
    expect(removed.slots[1]).toBeNull();
    expect(removed.defaultSlot).toBe(1);
  });
  it('migrates a binding only after real FLAC writeback and fresh backup proof', async () => {
    fs.unlinkSync(audio());
    const flac = path.join(path.dirname(audio()), 'audio.flac');
    const source = fs.readFileSync('scripts/fixtures/tags/tone.flac');
    fs.writeFileSync(flac, source);
    fs.writeFileSync(
      path.join(dir, 'library.json'),
      JSON.stringify({
        version: 2,
        tracks: {
          one: {
            title: 'New title',
            artist: 'Singer',
            contentHash: digest(source),
          },
        },
      }),
    );
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const tags = createTagWritebackService({
      getDirectory: () => scope,
      isBusy: () => false,
    });
    tags.activity({ trackIds: [] });
    const preview = await tags.preview({ trackId: 'one', fields: ['title'] });
    await tags.commit({ previewId: preview.previewId });
    const rebound = await runtime.get({ trackId: 'one' });
    expect(rebound).toMatchObject({ status: 'saved', values });
    expect(rebound.revision).not.toBe(saved.revision);
    // Reverting the sidecar to the old binding without its original backup is
    // never accepted merely because a ledger or index claims equivalence.
    const document = JSON.parse(fs.readFileSync(file()));
    document.binding.value = digest(source);
    fs.writeFileSync(file(), JSON.stringify(document));
    const ledger = JSON.parse(
      fs.readFileSync(path.join(dir, 'tag-writebacks.json')),
    );
    const backupId = ledger.receipts[0].backupId;
    // Locate the exact Main-owned backup via the existing transaction resolver.
    const { backupPath } = await import('../tags/transaction.js');
    fs.writeFileSync(
      backupPath(dir, backupId, 'original.flac'),
      'invalid backup',
    );
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      status: 'source-stale',
    });
  });

  it('refuses writes while a library journal requires recovery', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    fs.writeFileSync(
      path.join(dir, 'library-reconciliation-journal.json'),
      '{}',
    );
    await expect(runtime.save(intent(initial))).rejects.toMatchObject({
      code: 'RECONCILIATION_RECOVERY_REQUIRED',
    });
    expect(fs.existsSync(file())).toBe(false);
  });

  it('silently renews idle tokens after unchanged media and CAS verification and keeps the cache bounded', async () => {
    let now = 0;
    runtime = createPerformanceSettingsRuntime({
      getDirectory: () => scope,
      now: () => now,
      hasGuide: () => true,
    });
    const expired = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    now = 15 * 60_000 + 1;
    const renewed = await runtime.save(
      intent(expired, { ...values, pitchCents: 10 }),
    );
    expect(renewed).toMatchObject({
      status: 'saved',
      values: { ...values, pitchCents: 10 },
    });
    expect(renewed.token).not.toBe(expired.token);
    expect(renewed.revision).not.toBe(expired.revision);
    const evicted = await runtime.get({ trackId: 'one' });
    for (let index = 0; index < 128; index++)
      await runtime.get({ trackId: 'one' });
    await expect(runtime.save(intent(evicted))).rejects.toMatchObject({
      code: 'PERFORMANCE_STALE',
    });
  });
  it('renews idle tokens for default selection and removal without rereading the baseline', async () => {
    let now = 0;
    runtime = createPerformanceSettingsRuntime({
      getDirectory: () => scope,
      now: () => now,
    });
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const { values: ignored, ...selection } = intent(saved);
    expect(ignored).toEqual(values);
    now = 16 * 60_000;
    const selected = await runtime.setDefault(selection);
    expect(selected.token).not.toBe(saved.token);
    now += 16 * 60_000;
    const removed = await runtime.remove({
      ...selection,
      token: selected.token,
      expectedRevision: selected.revision,
    });
    expect(removed.status).toBe('removed');
  });
  it('does not resurrect an idle token cancelled while waiting for the shared lane', async () => {
    let now = 0;
    runtime = createPerformanceSettingsRuntime({
      getDirectory: () => scope,
      now: () => now,
    });
    const initial = await runtime.get({ trackId: 'one' });
    now = 16 * 60_000;
    const lane = createWorkOrganizationService({
      getLibraryContext: () => scope,
      resolveTrack: async () => null,
    });
    let release;
    const held = lane.runInLibrary(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    await Promise.resolve();
    const pending = runtime.save(intent(initial));
    await new Promise((done) => setImmediate(done));
    runtime.cancel({ token: initial.token });
    release();
    await held;
    await expect(pending).rejects.toMatchObject({ code: 'PERFORMANCE_STALE' });
    expect(fs.existsSync(file())).toBe(false);
  });
  it.each([true, false])(
    'keeps real conflicts on an expired token, including same-revision edits=%s',
    async (sameRevision) => {
      let now = 0;
      runtime = createPerformanceSettingsRuntime({
        getDirectory: () => scope,
        now: () => now,
        hasGuide: () => true,
      });
      const saved = await runtime.save(
        intent(await runtime.get({ trackId: 'one' })),
      );
      if (sameRevision) {
        const document = JSON.parse(fs.readFileSync(file()));
        document.slots[0].pitchCents = 20;
        fs.writeFileSync(file(), JSON.stringify(document));
      } else {
        await runtime.save(intent(saved, { ...values, pitchCents: 20 }));
      }
      const raw = fs.readFileSync(file(), 'utf8');
      now = 16 * 60_000;
      await expect(runtime.save(intent(saved))).rejects.toMatchObject({
        code: 'PERFORMANCE_CONFLICT',
      });
      expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
    },
  );
  it.each(['audio', 'incarnation', 'cancel', 'scope'])(
    'does not renew an expired token after %s changes',
    async (change) => {
      let now = 0;
      runtime = createPerformanceSettingsRuntime({
        getDirectory: () => scope,
        now: () => now,
        hasGuide: () => true,
      });
      const saved = await runtime.save(
        intent(await runtime.get({ trackId: 'one' })),
      );
      const raw = fs.readFileSync(file(), 'utf8');
      if (change === 'audio') fs.writeFileSync(audio(), 'replacement audio');
      if (change === 'incarnation') {
        const directory = path.dirname(audio());
        fs.renameSync(directory, directory + '-previous');
        fs.mkdirSync(directory);
        fs.writeFileSync(audio(), 'original audio');
        fs.writeFileSync(file(), raw);
      }
      if (change === 'cancel') runtime.cancel({ token: saved.token });
      if (change === 'scope') {
        scope = { dir, epoch: 1 };
        runtime.invalidate();
      }
      now = 16 * 60_000;
      await expect(runtime.save(intent(saved))).rejects.toMatchObject({
        code: ['audio', 'incarnation'].includes(change)
          ? 'PERFORMANCE_SOURCE_STALE'
          : 'PERFORMANCE_STALE',
      });
      expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
    },
  );

  it('times out waiting for the lane without permitting a late commit', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    const lane = createWorkOrganizationService({
      getLibraryContext: () => scope,
      resolveTrack: async () => null,
    });
    let release;
    const busy = lane.runInLibrary(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    await Promise.resolve();
    vi.useFakeTimers();
    const pending = runtime.save(intent(initial));
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'PERFORMANCE_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(10_001);
    await rejection;
    release();
    await busy;
    await Promise.resolve();
    expect(fs.existsSync(file())).toBe(false);
  });

  it('preserves the old file on an atomic rename failure and permits reread recovery', async () => {
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const raw = fs.readFileSync(file(), 'utf8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('device unavailable');
    });
    await expect(
      runtime.save(intent(saved, { ...values, pitchCents: 20 })),
    ).rejects.toThrow('device unavailable');
    rename.mockRestore();
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      revision: saved.revision,
      values,
    });
  });
  it('saves four fields and reads them after process restart without exposing binding', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    expect(initial).toMatchObject({
      status: 'absent',
      revision: null,
      values: null,
    });
    const saved = await runtime.save(intent(initial));
    expect(saved).toMatchObject({ status: 'saved', values });
    expect(saved.revision).not.toBe(initial.revision);
    expect(JSON.stringify(saved)).not.toMatch(
      /sha256|original audio|audio\.wav/,
    );
    const restarted = createPerformanceSettingsRuntime({
      getDirectory: () => scope,
    });
    expect(await restarted.get({ trackId: 'one' })).toMatchObject({
      status: 'saved',
      revision: saved.revision,
      values,
    });
    await expect(restarted.save(intent(saved))).rejects.toMatchObject({
      code: 'PERFORMANCE_STALE',
    });
  });

  it('retains unavailable guide selection, using true on the first save', async () => {
    let available = false;
    runtime = createPerformanceSettingsRuntime({
      getDirectory: () => scope,
      hasGuide: () => available,
    });
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    expect(saved.values.monitorGuideVocalEnabled).toBe(true);
    expect(saved.guideSelection).toBe('default');
    available = true;
    const disabled = await runtime.save(intent(saved));
    expect(disabled.values.monitorGuideVocalEnabled).toBe(false);
    available = false;
    const retained = await runtime.save(
      intent(disabled, { ...values, monitorGuideVocalEnabled: true }),
    );
    expect(retained.values.monitorGuideVocalEnabled).toBe(false);
    expect(retained.guideSelection).toBe('retained');
  });

  it('rejects old revision and save/remove/save ABA, preserving tombstone after restart', async () => {
    const before = await runtime.get({ trackId: 'one' });
    const saved = await runtime.save(intent(before));
    await expect(runtime.save(intent(before))).rejects.toMatchObject({
      code: 'PERFORMANCE_CONFLICT',
    });
    const removed = await runtime.remove({
      trackId: 'one',
      slot: 1,
      token: saved.token,
      expectedRevision: saved.revision,
    });
    expect(removed).toMatchObject({ status: 'removed', values: null });
    expect(removed.revision).not.toBe(saved.revision);
    await expect(runtime.save(intent(saved))).rejects.toMatchObject({
      code: 'PERFORMANCE_CONFLICT',
    });
    expect(JSON.parse(fs.readFileSync(file()))).toMatchObject({
      slots: [null, null, null],
      revision: removed.revision,
    });
  });

  it.each([
    { ...values, volume: 0.5 },
    { ...values, transposeSemitones: '2' },
    { ...values, transposeSemitones: 13 },
    { ...values, pitchCents: 51 },
    { ...values, pitchCents: NaN },
    { ...values, tempoRate: Infinity },
    { ...values, tempoRate: 0.91 },
    { ...values, monitorGuideVocalEnabled: 0 },
  ])('rejects invalid snapshot %j without writing', async (invalid) => {
    await expect(
      runtime.save(intent(await runtime.get({ trackId: 'one' }), invalid)),
    ).rejects.toMatchObject({ code: 'PERFORMANCE_INVALID' });
    expect(fs.existsSync(file())).toBe(false);
  });

  it.each(['../one', '.', 'one:bad', '__proto__', 'CON', '/one'])(
    'rejects unsafe track id %s',
    async (trackId) => {
      await expect(runtime.get({ trackId })).rejects.toMatchObject({
        code: 'PERFORMANCE_INVALID',
      });
    },
  );

  it.each([
    '{bad',
    JSON.stringify({ version: 99 }),
    JSON.stringify({ version: 1 }),
  ])('preserves invalid or unsupported sidecar bytes: %s', async (raw) => {
    fs.writeFileSync(file(), raw);
    await expect(runtime.get({ trackId: 'one' })).rejects.toMatchObject({
      code: raw.includes('99')
        ? 'PERFORMANCE_UNSUPPORTED'
        : 'PERFORMANCE_INVALID_DATA',
    });
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
  });

  it('detects external sidecar edits even if a revision is reused', async () => {
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const document = JSON.parse(fs.readFileSync(file()));
    document.slots[0].pitchCents = 10;
    fs.writeFileSync(file(), JSON.stringify(document));
    await expect(runtime.save(intent(saved))).rejects.toMatchObject({
      code: 'PERFORMANCE_CONFLICT',
    });
  });

  it('rehashes replaced media, preserves settings, rejects stale writers', async () => {
    const saved = await runtime.save(
      intent(await runtime.get({ trackId: 'one' })),
    );
    const raw = fs.readFileSync(file(), 'utf8');
    fs.writeFileSync(audio(), 'different audio');
    expect(await runtime.get({ trackId: 'one' })).toMatchObject({
      status: 'source-stale',
      values,
    });
    await expect(runtime.save(intent(saved))).rejects.toMatchObject({
      code: 'PERFORMANCE_SOURCE_STALE',
    });
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
  });

  it('memoizes only unchanged original media, ignoring metadata/separation changes', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    await runtime.get({ trackId: 'one' });
    await runtime.save(intent(initial));
    fs.writeFileSync(path.join(path.dirname(audio()), 'info.json'), '{}');
    await runtime.get({ trackId: 'one' });
    expect(hash).toHaveBeenCalledTimes(1);
    fs.writeFileSync(audio(), 'changed');
    await runtime.get({ trackId: 'one' });
    expect(hash).toHaveBeenCalledTimes(2);
  });

  it('rejects A→B→A scope and deletion incarnation tokens', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    scope = { dir, epoch: 2 };
    runtime.invalidate();
    await expect(runtime.save(intent(initial))).rejects.toMatchObject({
      code: 'PERFORMANCE_STALE',
    });
    const current = await runtime.get({ trackId: 'one' });
    runtime.invalidateTrack('one');
    await expect(runtime.save(intent(current))).rejects.toMatchObject({
      code: 'PERFORMANCE_STALE',
    });
  });

  it('does not recreate a deleted track', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    fs.rmSync(path.dirname(audio()), { recursive: true });
    await expect(runtime.save(intent(initial))).rejects.toMatchObject({
      code: 'PERFORMANCE_NOT_FOUND',
    });
    expect(fs.existsSync(path.dirname(audio()))).toBe(false);
  });

  it('rejects cancellation while awaiting the shared library lane', async () => {
    const initial = await runtime.get({ trackId: 'one' });
    const lane = createWorkOrganizationService({
      getLibraryContext: () => scope,
      resolveTrack: async () => null,
    });
    let release;
    const busy = lane.runInLibrary(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    await Promise.resolve();
    const pending = runtime.save(intent(initial));
    await runtime.cancel({ token: initial.token });
    release();
    await busy;
    await expect(pending).rejects.toMatchObject({ code: 'PERFORMANCE_STALE' });
    expect(fs.existsSync(file())).toBe(false);
  });

  it('invalidates a read which finishes after a scope switch', async () => {
    let release;
    runtime = createPerformanceSettingsRuntime({
      getDirectory: () => scope,
      hashAudio: () =>
        new Promise((done) => {
          release = done;
        }),
    });
    const pending = runtime.get({ trackId: 'one' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    scope = { dir, epoch: 2 };
    runtime.invalidate();
    release(await hashAudioFile(audio()));
    await expect(pending).rejects.toMatchObject({ code: 'PERFORMANCE_STALE' });
  });
});
