import { describe, it, expect, vi } from 'vitest';
import { createKugouAcquisitionProvider } from './acquisition.js';
import { lyricsIdentityKey } from '../lyricsProviders/identityResolver.js';
import { buildLrclibQueryPlan } from '../lrclib/query.js';

const track = { title: 'Song', artist: 'Lead, Guest', duration: 180 };
const song = (hash = 'a'.repeat(32), overrides = {}) => ({
  hash,
  title: 'Song',
  artist: 'Lead, Guest',
  durationSeconds: 180,
  ...overrides,
});
const lrc = '[ti:Song]\n[ar:Lead/Guest]\n[00:01]One\n[00:02]Two';
function client(overrides = {}) {
  return {
    search: vi.fn().mockResolvedValue({ status: 'ok', records: [song()] }),
    searchLyrics: vi.fn(async (hash) => ({
      status: 'ok',
      records: [
        {
          id: hash.startsWith('b') ? '124' : '123',
          accesskey: 'private',
          duration: 180000,
          lrcid: 0,
        },
      ],
    })),
    download: vi.fn(async (lyric) => ({
      status: 'ok',
      text: lrc.replace('Two', `Two ${lyric.id}`),
    })),
    ...overrides,
  };
}
describe('controlled Kugou line acquisition', () => {
  it('rejects an expired alias snapshot before fresh-save requests', async () => {
    let time = 1000;
    const c = client();
    const aliasEvidence = {
      identityKey: lyricsIdentityKey(buildLrclibQueryPlan(track).identity),
      aliases: { title: ['別名'] },
      evidence: [{ localized: '別名' }],
      expiresAt: 2000,
    };
    const persistRecord = vi.fn();
    const provider = createKugouAcquisitionProvider({
      client: c,
      now: () => time,
      persistRecord,
    });
    const result = await provider.searchCandidates(track, { aliasEvidence });
    const chosen = result.candidates[0];
    expect(chosen).toBeDefined();
    time = 2001;
    c.search.mockClear();
    expect(
      await provider.saveCandidate({
        track,
        candidateId: chosen.id,
        expectedFingerprint: chosen.previewFingerprint,
      }),
    ).toMatchObject({ reason: 'stale-search' });
    expect(c.search).not.toHaveBeenCalled();
    expect(persistRecord).not.toHaveBeenCalled();
  });
  it('does not inflate choices with identical lyric content under different upstream ids', async () => {
    const c = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [song(), song('b'.repeat(32))],
      }),
      download: vi.fn().mockResolvedValue({ status: 'ok', text: lrc }),
    });
    const r = await createKugouAcquisitionProvider({
      client: c,
    }).searchCandidates(track);
    expect(r.candidates).toHaveLength(1);
  });
  it('offers multiple validated candidates without exposing upstream identifiers', async () => {
    const c = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [song(), song('b'.repeat(32))],
      }),
    });
    const p = createKugouAcquisitionProvider({ client: c });
    const r = await p.searchCandidates(track);
    expect(r.status).toBe('ok');
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({
      capability: { level: 'T1' },
      compatibility: { t1: true, t2: false },
    });
    expect(JSON.stringify(r)).not.toMatch(/accesskey|private|"hash"/);
  });
  it.each([
    { artist: 'Lead, Guest, Wrong' },
    { artist: 'Guest' },
    { artist: 'Lead, Wrong' },
    { artist: 'Lead Tribute, Guest' },
    { title: 'Song (Live)' },
    { title: 'Song (ライブ)' },
    { durationSeconds: 190 },
  ])(
    'rejects catalog identity mismatch %j before hydration',
    async (override) => {
      const c = client({
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [song(undefined, override)],
        }),
      });
      const r = await createKugouAcquisitionProvider({
        client: c,
      }).searchCandidates(track);
      expect(r.candidates).toEqual([]);
      expect(c.searchLyrics).not.toHaveBeenCalled();
    },
  );
  it('rejects Live in the downloaded LRC even when catalog looks correct', async () => {
    const c = client({
      download: vi.fn().mockResolvedValue({
        status: 'ok',
        text: lrc.replace('[ti:Song]', '[ti:Song (Live)]'),
      }),
    });
    const r = await createKugouAcquisitionProvider({
      client: c,
    }).searchCandidates(track);
    expect(r.candidates).toEqual([]);
    expect(r.invalidRecordCount).toBeGreaterThan(0);
  });
  it('rejects an unexpected featured singer in the downloaded title', async () => {
    const c = client({
      download: vi.fn().mockResolvedValue({
        status: 'ok',
        text: lrc.replace('[ti:Song]', '[ti:Song (feat. Wrong)]'),
      }),
    });
    expect(
      (
        await createKugouAcquisitionProvider({ client: c }).searchCandidates(
          track,
        )
      ).candidates,
    ).toEqual([]);
  });
  it('cannot let an older hydration replace a preview refreshed during save', async () => {
    const c = client();
    const p = createKugouAcquisitionProvider({ client: c });
    const original = (await p.searchCandidates(track)).candidates[0];
    let resolveOld;
    c.download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const oldSearch = p.searchCandidates(track);
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    c.download.mockResolvedValue({
      status: 'ok',
      text: lrc.replace('Two', 'Changed'),
    });
    const changed = await p.saveCandidate({
      track,
      candidateId: original.id,
      expectedFingerprint: original.previewFingerprint,
    });
    resolveOld({ status: 'ok', text: lrc });
    const late = await oldSearch;
    expect(late.candidates[0].previewFingerprint).toBe(
      changed.candidate.previewFingerprint,
    );
  });
  it('preserves success on a later provider failure and stops variants', async () => {
    const c = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [song(), song('b'.repeat(32))],
      }),
      searchLyrics: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [
            { id: '123', accesskey: 'private', duration: 180000, lrcid: 0 },
          ],
        })
        .mockResolvedValue({ status: 'error', reason: 'rate-limited' }),
    });
    const r = await createKugouAcquisitionProvider({
      client: c,
    }).searchCandidates(track);
    expect(r).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'rate-limited',
    });
    expect(r.candidates).toHaveLength(1);
    expect(c.search).toHaveBeenCalledTimes(1);
  });
  it('uses input aliases automatically but preserves all credited artists', async () => {
    const c = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({ status: 'ok', records: [] })
        .mockResolvedValue({ status: 'ok', records: [song()] }),
    });
    const r = await createKugouAcquisitionProvider({
      client: c,
    }).searchCandidates({
      ...track,
      title: 'Song (歌曲)',
      artist: '리드 (Lead), Guest',
    });
    expect(r.candidates).toHaveLength(1);
    expect(c.search.mock.calls[1][0].artist).toContain('Guest');
  });
  it('requires complete identity and does not search without duration or artist', async () => {
    const c = client();
    const p = createKugouAcquisitionProvider({ client: c });
    for (const invalid of [
      { ...track, duration: null },
      { ...track, artist: '' },
    ])
      expect(await p.searchCandidates(invalid)).toMatchObject({
        status: 'unavailable',
        reason: 'missing-track-identity',
      });
    expect(c.search).not.toHaveBeenCalled();
  });
  it('retains old choices and explores the next query when broaden has no new candidates', async () => {
    const c = client();
    const p = createKugouAcquisitionProvider({ client: c });
    await p.searchCandidates(track);
    c.search.mockClear();
    c.search
      .mockResolvedValueOnce({ status: 'ok', records: [song()] })
      .mockResolvedValue({ status: 'ok', records: [song('b'.repeat(32))] });
    const more = await p.searchCandidates(track, { mode: 'broaden' });
    expect(more.candidates).toHaveLength(2);
    expect(c.search).toHaveBeenCalledTimes(2);
  });
  it('refuses unhandled LRC offsets instead of storing a misleading timeline', async () => {
    const c = client({
      download: vi
        .fn()
        .mockResolvedValue({ status: 'ok', text: '[offset:500]\n' + lrc }),
    });
    expect(
      (
        await createKugouAcquisitionProvider({ client: c }).searchCandidates(
          track,
        )
      ).candidates,
    ).toEqual([]);
  });
  it('propagates filesystem failure as a save failure rather than reporting offline', async () => {
    const p = createKugouAcquisitionProvider({
      client: client(),
      persistRecord() {
        throw new Error('disk failure');
      },
    });
    const chosen = (await p.searchCandidates(track)).candidates[0];
    await expect(
      p.saveCandidate({
        track,
        candidateId: chosen.id,
        expectedFingerprint: chosen.previewFingerprint,
      }),
    ).rejects.toThrow('disk failure');
  });
  it('freshly rechecks the selected catalog, lyrics identity and fingerprint before saving', async () => {
    const c = client();
    const persistRecord = vi.fn().mockReturnValue({ status: 'saved' });
    const p = createKugouAcquisitionProvider({ client: c, persistRecord });
    const first = await p.searchCandidates(track);
    const chosen = first.candidates[0];
    c.download.mockResolvedValue({
      status: 'ok',
      text: lrc.replace('Two', 'Changed'),
    });
    const r = await p.saveCandidate({
      track,
      trackDir: 'unused',
      candidateId: chosen.id,
      expectedFingerprint: chosen.previewFingerprint,
    });
    expect(r).toMatchObject({
      status: 'record-changed',
      candidate: { id: chosen.id },
    });
    expect(persistRecord).not.toHaveBeenCalled();
    expect(c.search.mock.calls.at(-1)[1]).toMatchObject({ fresh: true });
    expect(
      await p.saveCandidate({
        track,
        trackDir: 'unused',
        candidateId: r.candidate.id,
        expectedFingerprint: r.candidate.previewFingerprint,
      }),
    ).toMatchObject({ status: 'saved' });
    expect(persistRecord).toHaveBeenCalledTimes(1);
  });
  it('denies stale searches, invalid ids, contradictory fresh catalogs and cancelled commit', async () => {
    const c = client();
    const persistRecord = vi.fn();
    const p = createKugouAcquisitionProvider({ client: c, persistRecord });
    const chosen = (await p.searchCandidates(track)).candidates[0];
    expect(
      await p.saveCandidate({
        track: { ...track, artist: 'Other' },
        candidateId: chosen.id,
        expectedFingerprint: chosen.previewFingerprint,
      }),
    ).toMatchObject({ reason: 'stale-search' });
    await expect(
      p.saveCandidate({
        track,
        candidateId: '../evil',
        expectedFingerprint: chosen.previewFingerprint,
      }),
    ).rejects.toThrow();
    expect(
      await p.saveCandidate({
        track,
        candidateId: chosen.id,
        expectedFingerprint: chosen.previewFingerprint,
        validateCommit: () => 'stale-track',
      }),
    ).toMatchObject({ reason: 'stale-track' });
    c.search.mockResolvedValue({
      status: 'ok',
      records: [song(undefined, { artist: 'Wrong' })],
    });
    expect(
      await p.saveCandidate({
        track,
        candidateId: chosen.id,
        expectedFingerprint: chosen.previewFingerprint,
      }),
    ).toMatchObject({ reason: 'record-mismatch' });
    expect(persistRecord).not.toHaveBeenCalled();
  });
});
