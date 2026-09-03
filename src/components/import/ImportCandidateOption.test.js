import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ImportCandidateOption.vue', import.meta.url),
  'utf8',
);

describe('ImportCandidateOption compact disclosure', () => {
  it('shows familiar source, version, duration and views metadata', () => {
    expect(source).toContain('candidateSourceLabel');
    expect(source).toContain('playbackKindLabel');
    expect(source).toContain('formatDuration');
    expect(source).toContain('formatViewCount');
  });

  it('does not render internal confidence or recording-fit badges', () => {
    expect(source).not.toContain('confidenceLabel');
    expect(source).not.toContain('recordingFitLabel');
  });
});
