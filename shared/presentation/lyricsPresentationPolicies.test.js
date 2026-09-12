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
        label: '忠實原文',
        contentMode: 'literal',
        automaticLayout: false,
      },
      balanced: {
        id: 'balanced',
        version: 1,
        label: '平衡分行',
        contentMode: 'preserve',
        automaticLayout: true,
      },
      'broadcast-compact': {
        id: 'broadcast-compact',
        version: 1,
        label: '轉播精簡',
        contentMode: 'compact',
        automaticLayout: true,
      },
    });
  });

  it('exposes selectable policies only for templates that support them', () => {
    expect(lyricsPresentationPolicyOptionsForTemplate('live-stage')).toEqual([
      { id: 'broadcast-compact', label: '轉播精簡' },
      { id: 'balanced', label: '平衡分行' },
      { id: 'literal', label: '忠實原文' },
    ]);
    expect(lyricsPresentationPolicyOptionsForTemplate('focus-line')).toEqual(
      [],
    );
  });

  it('uses the template default for missing or invalid persisted values', () => {
    expect(normalizeLyricsPresentationPolicyId('live-stage')).toBe(
      'broadcast-compact',
    );
    expect(
      normalizeLyricsPresentationPolicyId('live-stage', 'unknown-policy'),
    ).toBe('broadcast-compact');
    expect(
      normalizeLyricsPresentationPolicyId('focus-line', 'literal'),
    ).toBeNull();
    expect(lyricsPresentationPolicyForTemplate('live-stage')).toMatchObject({
      id: 'broadcast-compact',
      contentMode: 'compact',
    });
  });
});
