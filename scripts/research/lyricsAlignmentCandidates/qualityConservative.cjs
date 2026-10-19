'use strict';
const { assessLine, qualityRules } = require('./quality.cjs');
// Exploratory v2: fixed after the hard-filter ablation, not a blind result.
const conservativeRules = Object.freeze({
  maxContradictionCoverage: 0.2,
  minAsrCharacters: 4,
  minStrongCoverage: 0.8,
  asrAgreementMs: 300,
  minTimeDisagreementMs: 1000,
});
const conservativeProfiles = Object.freeze([
  'advisory',
  'base-contradiction',
  'small-contradiction',
  'dual-contradiction',
]);
function assessConservative(
  line,
  starts,
  baseEvidence,
  smallEvidence,
  profile,
) {
  if (!conservativeProfiles.includes(profile))
    throw Error('quality conservative profile');
  const base = assessLine(line, starts, baseEvidence, 'baseline'),
    small = assessLine(line, starts, smallEvidence, 'baseline');
  const contradicts = (r) =>
    r.asrCharacters >= conservativeRules.minAsrCharacters &&
    r.compatibilityCoverage <= conservativeRules.maxContradictionCoverage;
  const both = contradicts(base) && contradicts(small);
  const reject =
    profile === 'base-contradiction'
      ? contradicts(base)
      : profile === 'small-contradiction'
        ? contradicts(small)
        : profile === 'dual-contradiction'
          ? both
          : false;
  const result = reject ? new Map() : new Map(starts),
    rejectedTime = [];
  if (
    !reject &&
    profile === 'dual-contradiction' &&
    base.contentCoverage >= conservativeRules.minStrongCoverage &&
    small.contentCoverage >= conservativeRules.minStrongCoverage
  ) {
    const b = new Map(base.clockSupports.map((s) => [s.from, s.startMs])),
      s = new Map(small.clockSupports.map((t) => [t.from, t.startMs]));
    for (const [from, startMs] of starts) {
      if (from === 0 || !b.has(from) || !s.has(from)) continue;
      if (
        Math.abs(b.get(from) - s.get(from)) <=
          conservativeRules.asrAgreementMs &&
        Math.abs(startMs - b.get(from)) >=
          conservativeRules.minTimeDisagreementMs &&
        Math.abs(startMs - s.get(from)) >=
          conservativeRules.minTimeDisagreementMs
      ) {
        result.delete(from);
        rejectedTime.push(from);
      }
    }
  }
  return {
    starts: result,
    contentState: both
      ? 'contradiction'
      : base.contentAccepted && small.contentAccepted
        ? 'supported'
        : 'unknown',
    activityWarning: base.activeRatio < qualityRules.minActiveRatio,
    activeRatio: base.activeRatio,
    rejectedContent: reject,
    rejectedTime,
    base: {
      coverage: base.contentCoverage,
      compatibility: base.compatibilityCoverage,
      asrCharacters: base.asrCharacters,
    },
    small: {
      coverage: small.contentCoverage,
      compatibility: small.compatibilityCoverage,
      asrCharacters: small.asrCharacters,
    },
  };
}
module.exports = {
  conservativeRules,
  conservativeProfiles,
  assessConservative,
};
