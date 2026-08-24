import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyTempoRelation } from './music-analysis-evaluation.mjs';

const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../electron/lib/fixtures/musicStructure/tempo-octave-evaluation.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('classifyTempoRelation', () => {
  it.each(fixture.cases)(
    'classifies the fixed $id case without silently correcting BPM',
    ({ referenceBpm, estimatedBpm, expectedRelation }) => {
      expect(
        classifyTempoRelation(referenceBpm, estimatedBpm, {
          toleranceRatio: fixture.toleranceRatio,
        }),
      ).toBe(expectedRelation);
    },
  );

  it('rejects invalid evaluation inputs', () => {
    expect(() => classifyTempoRelation(0, 120)).toThrow(/positive/i);
    expect(() => classifyTempoRelation(120, 60, { toleranceRatio: 1 })).toThrow(
      /tolerance/i,
    );
  });
});
