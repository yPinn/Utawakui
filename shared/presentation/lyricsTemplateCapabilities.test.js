import { describe, expect, it } from 'vitest';
import {
  LYRICS_TEMPLATE_CAPABILITIES,
  lyricsTemplateCapabilities,
} from './lyricsTemplateCapabilities.mjs';

const EXPECTED_LYRICS_TEMPLATE_CAPABILITIES = Object.freeze({
  'focus-line': {
    minimumTimingTier: 'T1',
    t1Progress: 'estimated-segments',
    t2Progress: 'exact-segments',
    usesSourceMappedTiming: false,
    music: { cadence: true, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments'],
    presentationPolicyIds: [],
  },
  'quiet-caption': {
    minimumTimingTier: 'T1',
    t1Progress: 'estimated-segments',
    t2Progress: 'exact-segments',
    usesSourceMappedTiming: false,
    music: { cadence: true, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments'],
    presentationPolicyIds: [],
  },
  'karaoke-stack': {
    minimumTimingTier: 'T1',
    t1Progress: 'estimated-segments',
    t2Progress: 'source-mapped-phrases',
    usesSourceMappedTiming: true,
    music: { cadence: true, beatPhase: true, sections: true },
    scheduler: ['ktv', 'beat-phase', 'music-sections'],
    presentationPolicyIds: [],
  },
  'manga-frame': {
    minimumTimingTier: 'T1',
    t1Progress: 'line-entry',
    t2Progress: 'source-mapped-bubbles',
    usesSourceMappedTiming: true,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments', 'manga-bubbles'],
    presentationPolicyIds: [],
  },
  'kinetic-pop': {
    minimumTimingTier: 'T1',
    t1Progress: 'weighted-phrases',
    t2Progress: 'source-mapped-phrases',
    usesSourceMappedTiming: true,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-lines', 'kinetic-phrases'],
    presentationPolicyIds: [],
  },
  'ornate-vertical': {
    minimumTimingTier: 'T1',
    t1Progress: 'line-entry',
    t2Progress: 'not-consumed',
    usesSourceMappedTiming: false,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-lines'],
    presentationPolicyIds: [],
  },
  'live-stage': {
    minimumTimingTier: 'T1',
    t1Progress: 'weighted-pages',
    t2Progress: 'source-mapped-pages',
    usesSourceMappedTiming: true,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-lines', 'live-stage-card', 'live-stage-captions'],
    presentationPolicyIds: ['broadcast-compact', 'balanced', 'literal'],
    defaultPresentationPolicyId: 'broadcast-compact',
  },
  'reading-aid': {
    minimumTimingTier: 'T1',
    t1Progress: 'line-entry',
    t2Progress: 'exact-segments',
    usesSourceMappedTiming: false,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments'],
    presentationPolicyIds: [],
  },
});

describe('lyrics template capability registry', () => {
  it('states timing and music behavior independently for every lyrics template', () => {
    expect(
      Object.fromEntries(
        Object.keys(EXPECTED_LYRICS_TEMPLATE_CAPABILITIES).map((templateId) => [
          templateId,
          lyricsTemplateCapabilities(templateId),
        ]),
      ),
    ).toEqual(EXPECTED_LYRICS_TEMPLATE_CAPABILITIES);
  });

  it('fails closed for an unknown template without borrowing another style', () => {
    expect(lyricsTemplateCapabilities('unknown-template')).toEqual({
      minimumTimingTier: 'T1',
      t1Progress: 'line-entry',
      t2Progress: 'not-consumed',
      usesSourceMappedTiming: false,
      music: { cadence: false, beatPhase: false, sections: false },
      scheduler: ['lyrics-lines'],
      presentationPolicyIds: [],
    });
  });

  it('publishes deeply immutable capability records', () => {
    expect(Object.isFrozen(LYRICS_TEMPLATE_CAPABILITIES)).toBe(true);
    for (const capability of Object.values(LYRICS_TEMPLATE_CAPABILITIES)) {
      expect(Object.isFrozen(capability)).toBe(true);
      expect(Object.isFrozen(capability.music)).toBe(true);
      expect(Object.isFrozen(capability.scheduler)).toBe(true);
      expect(Object.isFrozen(capability.presentationPolicyIds)).toBe(true);
    }
  });
});
