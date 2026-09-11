import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ImportCandidateOption.vue', import.meta.url),
  'utf8',
);

describe('ImportCandidateOption compact disclosure', () => {
  it('shows pasted-source provenance and decision-useful version metadata', () => {
    expect(source).toContain('v-if="candidate.isSource"');
    expect(source).toContain('貼上的來源');
    expect(source).not.toContain('candidateSourceLabel');
    expect(source).toContain('playbackKindLabel');
    expect(source).toContain('formatDuration');
    expect(source).toContain('formatViewCount');
  });

  it('does not render internal confidence or recording-fit badges', () => {
    expect(source).not.toContain('confidenceLabel');
    expect(source).not.toContain('recordingFitLabel');
  });
});
