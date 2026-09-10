import { describe, expect, it } from 'vitest';
import {
  hashReadingLineText,
  resolveReadingCorrectionShadow,
  validateReadingCorrectionPack,
} from './corrections.js';

function correctionPack() {
  return {
    schemaVersion: 1,
    packId: 'synthetic-song-readings',
    version: '2026.09.10',
    license: 'CC0-1.0',
    entries: [
      {
        correctionId: 'synthetic-uchu-sora',
        recordingIdentity: 'synthetic:starlight:studio',
        line: {
          textSha256: hashReadingLineText('夜の宇宙'),
          occurrence: 0,
        },
        target: { surface: '宇宙', occurrence: 0, reading: 'そら' },
        evidence: { kind: 'synthetic' },
      },
    ],
  };
}

describe('reading correction pack validation', () => {
  it('accepts a bounded exact-scope pack without mutating it', () => {
    const pack = correctionPack();
    const before = structuredClone(pack);

    expect(validateReadingCorrectionPack(pack)).toEqual(before);
    expect(pack).toEqual(before);
  });

  it('rejects unsafe fields, non-kana readings, duplicate ids, and conflicting scopes', () => {
    const withScript = correctionPack();
    withScript.entries[0].script = 'alert(1)';
    expect(() => validateReadingCorrectionPack(withScript)).toThrow(
      /invalid fields/i,
    );

    const nonKana = correctionPack();
    nonKana.entries[0].target.reading = '<ruby>そら</ruby>';
    expect(() => validateReadingCorrectionPack(nonKana)).toThrow(/reading/i);

    const duplicateId = correctionPack();
    duplicateId.entries.push(structuredClone(duplicateId.entries[0]));
    expect(() => validateReadingCorrectionPack(duplicateId)).toThrow(
      /correction ids must be unique/i,
    );

    const conflict = correctionPack();
    conflict.entries.push({
      ...structuredClone(conflict.entries[0]),
      correctionId: 'synthetic-uchu-cosmos',
      target: { surface: '宇宙', occurrence: 0, reading: 'こすもす' },
    });
    expect(() => validateReadingCorrectionPack(conflict)).toThrow(
      /conflicting correction scope/i,
    );

    const reorderedConflict = correctionPack();
    const reorderedEntry = structuredClone(reorderedConflict.entries[0]);
    reorderedEntry.correctionId = 'synthetic-uchu-reordered';
    reorderedEntry.line = {
      occurrence: reorderedEntry.line.occurrence,
      textSha256: reorderedEntry.line.textSha256,
    };
    reorderedEntry.target.reading = 'こすもす';
    reorderedConflict.entries.push(reorderedEntry);
    expect(() => validateReadingCorrectionPack(reorderedConflict)).toThrow(
      /conflicting correction scope/i,
    );
  });
});

describe('resolveReadingCorrectionShadow', () => {
  it('reports an exact recording, line, and surface match without changing text', () => {
    const lines = ['夜の宇宙', 'まだ歌う'];
    const before = lines.slice();

    const result = resolveReadingCorrectionShadow(correctionPack(), {
      recordingIdentity: 'synthetic:starlight:studio',
      lines,
    });

    expect(result).toEqual({
      mode: 'shadow',
      pack: {
        id: 'synthetic-song-readings',
        version: '2026.09.10',
      },
      matches: [
        {
          correctionId: 'synthetic-uchu-sora',
          lineIndex: 0,
          start: 2,
          end: 4,
          surface: '宇宙',
          reading: 'そら',
        },
      ],
      skipped: [],
    });
    expect(lines).toEqual(before);
  });

  it('fails closed on recording, line, neighboring context, or target mismatch', () => {
    const pack = correctionPack();
    pack.entries = [
      {
        ...structuredClone(pack.entries[0]),
        correctionId: 'synthetic-contextual-reading',
        line: {
          ...structuredClone(pack.entries[0].line),
          previousTextSha256: hashReadingLineText('前の行'),
        },
      },
    ];

    const wrongRecording = resolveReadingCorrectionShadow(pack, {
      recordingIdentity: 'synthetic:other:studio',
      lines: ['夜の宇宙'],
    });
    expect(wrongRecording.matches).toEqual([]);
    expect(wrongRecording.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'recording-mismatch' }),
      ]),
    );

    const wrongContext = resolveReadingCorrectionShadow(pack, {
      recordingIdentity: 'synthetic:starlight:studio',
      lines: ['違う前行', '夜の宇宙'],
    });
    expect(wrongContext.matches).toEqual([]);
    expect(wrongContext.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'context-mismatch' }),
      ]),
    );

    const wrongLine = resolveReadingCorrectionShadow(pack, {
      recordingIdentity: 'synthetic:starlight:studio',
      lines: ['前の行', '違う行'],
    });
    expect(wrongLine.matches).toEqual([]);
    expect(wrongLine.skipped).toEqual([
      expect.objectContaining({ reason: 'line-mismatch' }),
    ]);
  });

  it('rejects a correction document above the aggregate text budget', () => {
    expect(() =>
      resolveReadingCorrectionShadow(correctionPack(), {
        recordingIdentity: 'synthetic:starlight:studio',
        lines: Array.from({ length: 26 }, () => 'あ'.repeat(10_000)),
      }),
    ).toThrow(/document text/i);
  });

  it('uses explicit line and surface occurrences for repeated text', () => {
    const pack = correctionPack();
    pack.entries[0].line.textSha256 = hashReadingLineText('宇宙と宇宙');
    pack.entries[0].line.occurrence = 1;
    pack.entries[0].target.occurrence = 1;

    const result = resolveReadingCorrectionShadow(pack, {
      recordingIdentity: 'synthetic:starlight:studio',
      lines: ['宇宙と宇宙', '宇宙と宇宙'],
    });

    expect(result.matches).toEqual([
      expect.objectContaining({ lineIndex: 1, start: 3, end: 5 }),
    ]);
  });

  it('fails closed when distinct correction scopes overlap after matching', () => {
    const pack = correctionPack();
    pack.entries.push({
      ...structuredClone(pack.entries[0]),
      correctionId: 'synthetic-whole-line-reading',
      target: {
        surface: '夜の宇宙',
        occurrence: 0,
        reading: 'よるのそら',
      },
    });

    const result = resolveReadingCorrectionShadow(pack, {
      recordingIdentity: 'synthetic:starlight:studio',
      lines: ['夜の宇宙'],
    });

    expect(result.matches).toEqual([]);
    expect(result.skipped).toEqual([
      {
        correctionId: 'synthetic-uchu-sora',
        reason: 'overlapping-correction-conflict',
      },
      {
        correctionId: 'synthetic-whole-line-reading',
        reason: 'overlapping-correction-conflict',
      },
    ]);
  });
});
