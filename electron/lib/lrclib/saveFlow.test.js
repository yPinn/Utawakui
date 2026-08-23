import { describe, expect, it, vi } from 'vitest';
import { fingerprintLrclibRecord } from './record.js';
import { saveLrclibCandidate } from './saveFlow.js';

function record(overrides = {}) {
  return {
    id: 42,
    name: 'Song - Artist',
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Hello',
    syncedLyrics: '[00:01.000]Hello',
    lyricsfile: null,
    ...overrides,
  };
}

const track = { title: 'Song', artist: 'Artist', duration: 180 };

describe('saveLrclibCandidate', () => {
  it('re-fetches by id and stores only an unchanged previewed record', async () => {
    const fetchedRecord = record();
    const fetchRecord = vi
      .fn()
      .mockResolvedValue({ status: 'ok', record: fetchedRecord });
    const persistRecord = vi.fn(() => ({
      status: 'saved',
      source: { filename: 'lrclib-42.lrc' },
    }));

    await expect(
      saveLrclibCandidate({
        track,
        trackDir: 'track-dir',
        candidateId: 42,
        expectedFingerprint: fingerprintLrclibRecord(fetchedRecord),
        fetchRecord,
        persistRecord,
      }),
    ).resolves.toMatchObject({
      status: 'saved',
      source: { filename: 'lrclib-42.lrc' },
    });
    expect(fetchRecord).toHaveBeenCalledWith(42);
    expect(persistRecord).toHaveBeenCalledWith('track-dir', fetchedRecord);
  });

  it('returns a bounded refreshed summary and does not save changed content', async () => {
    const changed = record({ plainLyrics: 'Changed' });
    const persistRecord = vi.fn();

    await expect(
      saveLrclibCandidate({
        track,
        trackDir: 'track-dir',
        candidateId: 42,
        expectedFingerprint: fingerprintLrclibRecord(record()),
        fetchRecord: vi.fn().mockResolvedValue({
          status: 'ok',
          record: changed,
        }),
        persistRecord,
      }),
    ).resolves.toMatchObject({
      status: 'record-changed',
      candidate: {
        id: 42,
        trackName: 'Song',
        previewFingerprint: fingerprintLrclibRecord(changed),
      },
    });
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('rejects missing preview identity before issuing a provider request', async () => {
    const fetchRecord = vi.fn();

    await expect(
      saveLrclibCandidate({
        track,
        trackDir: 'track-dir',
        candidateId: 42,
        expectedFingerprint: null,
        fetchRecord,
      }),
    ).rejects.toThrow(/preview fingerprint/i);
    expect(fetchRecord).not.toHaveBeenCalled();
  });

  it('returns the typed provider failure without writing', async () => {
    const persistRecord = vi.fn();
    await expect(
      saveLrclibCandidate({
        track,
        trackDir: 'track-dir',
        candidateId: 42,
        expectedFingerprint: 'a'.repeat(64),
        fetchRecord: vi
          .fn()
          .mockResolvedValue({ status: 'error', reason: 'offline' }),
        persistRecord,
      }),
    ).resolves.toEqual({
      provider: 'lrclib',
      status: 'error',
      reason: 'offline',
    });
    expect(persistRecord).not.toHaveBeenCalled();
  });
});
