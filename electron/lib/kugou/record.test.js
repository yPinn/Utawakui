import { expect, it } from 'vitest';
import { fingerprintKugouRecord } from './record.js';
it('pins preview fingerprints to recording metadata and complete lyric content', () => {
  const record = {
    id: 1,
    trackName: 'Song',
    artistName: 'Artist',
    duration: 180,
    lrcLyrics: '[00:01]One\n[00:02]Two',
  };
  const fingerprint = fingerprintKugouRecord(record);
  expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  expect(fingerprintKugouRecord({ ...record })).toBe(fingerprint);
  for (const change of [
    { duration: 182 },
    { artistName: 'Other' },
    { lrcLyrics: record.lrcLyrics + '\n[00:03]Three' },
    { id: 2 },
  ]) {
    expect(fingerprintKugouRecord({ ...record, ...change })).not.toBe(
      fingerprint,
    );
  }
});
