const UNKNOWN_LYRICS_TEMPLATE_CAPABILITIES = freezeCapabilities({
  minimumTimingTier: 'T1',
  t1Progress: 'line-entry',
  t2Progress: 'not-consumed',
  usesSourceMappedTiming: false,
  music: { cadence: false, beatPhase: false, sections: false },
  scheduler: ['lyrics-lines'],
});

function freezeCapabilities(capabilities) {
  return Object.freeze({
    ...capabilities,
    music: Object.freeze({ ...capabilities.music }),
    scheduler: Object.freeze([...capabilities.scheduler]),
    presentationPolicyIds: Object.freeze([
      ...(capabilities.presentationPolicyIds ?? []),
    ]),
  });
}

export const LYRICS_TEMPLATE_CAPABILITIES = Object.freeze({
  'focus-line': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'estimated-segments',
    t2Progress: 'exact-segments',
    usesSourceMappedTiming: false,
    music: { cadence: true, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments'],
  }),
  'quiet-caption': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'estimated-segments',
    t2Progress: 'exact-segments',
    usesSourceMappedTiming: false,
    music: { cadence: true, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments'],
  }),
  'karaoke-stack': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'estimated-segments',
    t2Progress: 'source-mapped-phrases',
    usesSourceMappedTiming: true,
    music: { cadence: true, beatPhase: true, sections: true },
    scheduler: ['ktv', 'beat-phase', 'music-sections'],
  }),
  'manga-frame': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'line-entry',
    t2Progress: 'source-mapped-bubbles',
    usesSourceMappedTiming: true,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments', 'manga-bubbles'],
  }),
  'kinetic-pop': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'weighted-phrases',
    t2Progress: 'source-mapped-phrases',
    usesSourceMappedTiming: true,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-lines', 'kinetic-phrases'],
  }),
  'ornate-vertical': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'line-entry',
    t2Progress: 'not-consumed',
    usesSourceMappedTiming: false,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-lines'],
  }),
  'live-stage': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'weighted-pages',
    t2Progress: 'source-mapped-pages',
    usesSourceMappedTiming: true,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-lines', 'live-stage-card', 'live-stage-captions'],
    presentationPolicyIds: ['broadcast-compact', 'balanced', 'literal'],
    defaultPresentationPolicyId: 'broadcast-compact',
  }),
  'reading-aid': freezeCapabilities({
    minimumTimingTier: 'T1',
    t1Progress: 'line-entry',
    t2Progress: 'exact-segments',
    usesSourceMappedTiming: false,
    music: { cadence: false, beatPhase: false, sections: false },
    scheduler: ['lyrics-segments'],
  }),
});

export function lyricsTemplateCapabilities(templateId) {
  return (
    LYRICS_TEMPLATE_CAPABILITIES[String(templateId ?? '')] ??
    UNKNOWN_LYRICS_TEMPLATE_CAPABILITIES
  );
}
