import { describe, expect, it } from 'vitest';
import {
  LYRICS_PRESENTATION_POLICIES,
  lyricsPresentationPolicyForTemplate,
  lyricsPresentationPolicyOptionsForTemplate,
  normalizeLyricsPresentationPolicyId,
} from './lyricsPresentationPolicies.mjs';

describe('lyrics presentation policies', () => {
  it('defines content handling separately from timing and template style', () => {
    expect(LYRICS_PRESENTATION_POLICIES).toEqual({
      literal: {
        id: 'literal',
        version: 1,
        contentMode: 'literal',
        automaticLayout: false,
      },
      balanced: {
        id: 'balanced',
        version: 1,
        contentMode: 'preserve',
        automaticLayout: true,
      },
      'broadcast-compact': {
        id: 'broadcast-compact',
        version: 1,
        contentMode: 'compact',
        automaticLayout: true,
      },
    });
  });

  it('exposes selectable policies only for templates that support them', () => {
    expect(lyricsPresentationPolicyOptionsForTemplate('live-stage')).toEqual([
      { id: 'broadcast-compact' },
      { id: 'balanced' },
      { id: 'literal' },
    ]);
    expect(lyricsPresentationPolicyOptionsForTemplate('focus-line')).toEqual(
      [],
    );
  });

  it('uses the template default for missing or invalid persisted values', () => {
    expect(normalizeLyricsPresentationPolicyId('live-stage')).toBe('balanced');
    expect(
      normalizeLyricsPresentationPolicyId('live-stage', 'unknown-policy'),
    ).toBe('balanced');
    expect(
      normalizeLyricsPresentationPolicyId('focus-line', 'literal'),
    ).toBeNull();
    expect(lyricsPresentationPolicyForTemplate('live-stage')).toMatchObject({
      id: 'balanced',
      contentMode: 'preserve',
    });
  });
});
