import { describe, expect, it } from 'vitest';
import { romanize } from 'koroman';
import { buildRomanizationDoc } from './lyricsReading.js';

// Exercises the real adapter shape lyricsReadingWorker.js uses (koroman.romanize
// fed straight into buildRomanizationDoc) against the actual package — the
// one test in this repo that would catch a koroman version bump silently
// changing its pronunciation-rule output. No network dependency (koroman
// has zero runtime deps and does everything in-process), so this isn't
// flaky. Generic vocabulary only, never real song lyrics — see CLAUDE.md.
describe('koroman integration', () => {
  it('applies real assimilation rules, not a naive per-syllable transliteration', () => {
    const doc = buildRomanizationDoc(['신라', '학문', '좋아요'], {
      romanize: (text) => romanize(text, { usePronunciationRules: true }),
    });

    // Lateralization (유음화): ㄴ+ㄹ -> ll, not the naive "sinla".
    expect(doc.lines[0]).toEqual({
      text: '신라',
      segments: [{ t: '신라' }],
      romaji: 'silla',
      edited: false,
    });
    // Nasal assimilation (비음화).
    expect(doc.lines[1]).toEqual({
      text: '학문',
      segments: [{ t: '학문' }],
      romaji: 'hangmun',
      edited: false,
    });
    // Liaison (연음화): the batchim carries into the next syllable's onset.
    expect(doc.lines[2]).toEqual({
      text: '좋아요',
      segments: [{ t: '좋아요' }],
      romaji: 'joayo',
      edited: false,
    });
  });

  it('leaves Latin text untouched across a Korean/English code-switch, no gap or mangling', () => {
    const doc = buildRomanizationDoc(['너의 baby'], {
      romanize: (text) => romanize(text, { usePronunciationRules: true }),
    });

    expect(doc.lines[0].text).toBe('너의 baby');
    // Single plain segment, same as every other buildRomanizationDoc line —
    // Korean lines never produce ruby, mixed-script or not.
    expect(doc.lines[0].segments).toEqual([{ t: '너의 baby' }]);
    expect(doc.lines[0].romaji).toBe('neoui baby');
  });

  it('skips romanizing an all-Latin line entirely, leaving romaji empty', () => {
    const doc = buildRomanizationDoc(['hello world'], {
      romanize: (text) => romanize(text, { usePronunciationRules: true }),
    });

    expect(doc.lines[0]).toEqual({
      text: 'hello world',
      segments: [{ t: 'hello world' }],
      romaji: '',
      edited: false,
    });
  });

  it('also skips a bare-jamo line — unlike buildReadingDoc, this is not the all-kana bug', () => {
    // Japanese has two phonetic scripts (kanji needs tokenizing, kana
    // doesn't but still needs romaji) — buildReadingDoc's containsKanji
    // gate used to wrongly skip romaji for all-kana lines too (see
    // lyricsReading.test.js). Korean has no such split: every real word is
    // written as composed syllables (U+AC00-D7A3), which containsHangul
    // already catches completely. A bare-jamo line like "ㅋㅋㅋ" (laughter)
    // isn't a composed word at all — koroman itself has no rule for it and
    // hands it back unchanged (verified directly against the real
    // package, not assumed), so widening the gate to catch it would only
    // add a romaji row identical to the line itself, not a translation.
    expect(romanize('ㅋㅋㅋ', { usePronunciationRules: true })).toBe('ㅋㅋㅋ');

    const doc = buildRomanizationDoc(['ㅋㅋㅋ'], {
      romanize: (text) => romanize(text, { usePronunciationRules: true }),
    });

    expect(doc.lines[0]).toEqual({
      text: 'ㅋㅋㅋ',
      segments: [{ t: 'ㅋㅋㅋ' }],
      romaji: '',
      edited: false,
    });
  });
});
