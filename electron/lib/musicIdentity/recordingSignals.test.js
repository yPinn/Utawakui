import { describe, expect, it } from 'vitest';
import {
  candidateIntroducesVersion,
  versionTerms,
} from './recordingSignals.js';

describe('recording version signals', () => {
  it('extracts the established recording-version vocabulary from raw text', () => {
    expect([...versionTerms('Song (Live Session) - FIRST TAKE')]).toEqual([
      'live',
      'session',
      'first take',
    ]);
  });

  it('reports candidate-extra terms as asymmetric evidence', () => {
    expect(candidateIntroducesVersion(['Song'], ['Song', 'Live Session'])).toBe(
      true,
    );
    expect(candidateIntroducesVersion(['Song Live'], ['Song'])).toBe(false);
  });
});
