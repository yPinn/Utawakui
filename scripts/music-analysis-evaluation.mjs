function requirePositiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
}

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / expected;
}

export function classifyTempoRelation(
  referenceBpm,
  estimatedBpm,
  { toleranceRatio = 0.04 } = {},
) {
  requirePositiveFinite(referenceBpm, 'reference BPM');
  requirePositiveFinite(estimatedBpm, 'estimated BPM');
  if (
    !Number.isFinite(toleranceRatio) ||
    toleranceRatio < 0 ||
    toleranceRatio >= 0.5
  ) {
    throw new TypeError('tolerance ratio must be between 0 and 0.5');
  }

  const candidates = [
    ['match', referenceBpm],
    ['half-time', referenceBpm / 2],
    ['double-time', referenceBpm * 2],
  ];
  const relation = candidates.find(
    ([, candidateBpm]) =>
      relativeError(estimatedBpm, candidateBpm) <= toleranceRatio,
  );
  return relation?.[0] ?? 'unrelated';
}
