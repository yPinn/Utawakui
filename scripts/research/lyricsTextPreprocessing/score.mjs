export function describeNumbers(values) {
  const numbers = values
    .filter((x) => typeof x === 'number' && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  const percentile = (p) =>
    numbers[Math.max(0, Math.ceil(numbers.length * p) - 1)];
  return {
    n: numbers.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    min: numbers[0],
    max: numbers.at(-1),
    sum: numbers.reduce((a, b) => a + b, 0),
  };
}

export function referenceOffsets(parts) {
  let offset = 0;
  return parts.slice(0, -1).map((p) => (offset += p.length));
}

export function scoreQuality(cases, rows) {
  const items = cases.map((c) => ({
    c,
    r: rows.find((r) => r.caseId === c.id),
  }));
  const isCandidate = (r) =>
    r?.status === 'accepted' && r.suggestion?.kind === 'credit-candidate';
  const rawKind = (r) => {
    try {
      const kind = JSON.parse(r?.raw?.choices?.[0]?.message?.content).kind;
      return ['credit-candidate', 'lyric', 'ambiguous'].includes(kind)
        ? kind
        : null;
    } catch {
      return null;
    }
  };
  const credits = items.filter(({ c }) => c.group === 'credit');
  const performed = items.filter(({ c }) => c.group === 'performed');
  const ambiguous = performed.filter(({ c }) => c.indistinguishablePair);
  const other = performed.filter(({ c }) => !c.indistinguishablePair);
  const long = items.filter(({ c }) => c.group === 'long');
  let exact = 0,
    matched = 0,
    predicted = 0,
    expected = 0;
  for (const { c, r } of long) {
    const reference = referenceOffsets(c.referencePartitions[0]);
    const selected = r?.status === 'accepted' ? r.suggestion.offsets : [];
    if (
      r?.status === 'accepted' &&
      c.referencePartitions.some(
        (parts) =>
          JSON.stringify(referenceOffsets(parts)) === JSON.stringify(selected),
      )
    )
      exact++;
    matched += selected.filter((p) => reference.includes(p)).length;
    predicted += selected.length;
    expected += reference.length;
  }
  return {
    scheduled: cases.length,
    attempted: items.filter((x) => x.r).length,
    missing: items.filter((x) => !x.r).length,
    accepted: items.filter((x) => x.r?.status === 'accepted').length,
    fallback: items.filter((x) => x.r?.status === 'fallback').length,
    creditCount: credits.length,
    creditCandidates: credits.filter((x) => isCandidate(x.r)).length,
    rawCreditCandidates: credits.filter(
      (x) => rawKind(x.r) === 'credit-candidate',
    ).length,
    rawUnclassified: items.filter((x) => rawKind(x.r) === null).length,
    creditAbstentions: credits.filter(
      (x) => x.r?.status === 'accepted' && x.r.suggestion?.kind === 'ambiguous',
    ).length,
    ambiguousPerformedCount: ambiguous.length,
    ambiguousPerformedCandidateCount: ambiguous.filter((x) => isCandidate(x.r))
      .length,
    rawAmbiguousPerformedCandidateCount: ambiguous.filter(
      (x) => rawKind(x.r) === 'credit-candidate',
    ).length,
    rawAmbiguousPerformedAbstentions: ambiguous.filter(
      (x) => rawKind(x.r) === 'ambiguous',
    ).length,
    ambiguousPerformedAbstentions: ambiguous.filter(
      (x) => x.r?.status === 'accepted' && x.r.suggestion?.kind === 'ambiguous',
    ).length,
    otherPerformedCount: other.length,
    otherPerformedFalseCandidates: other.filter((x) => isCandidate(x.r)).length,
    rawOtherPerformedFalseCandidates: other.filter(
      (x) => rawKind(x.r) === 'credit-candidate',
    ).length,
    rawOtherPerformedAbstentions: other.filter(
      (x) => rawKind(x.r) === 'ambiguous',
    ).length,
    otherPerformedAbstentions: other.filter(
      (x) => x.r?.status === 'accepted' && x.r.suggestion?.kind === 'ambiguous',
    ).length,
    creditUnexpectedSplits: credits.filter(
      (x) => x.r?.status === 'accepted' && x.r.suggestion.offsets.length,
    ).length,
    longCount: long.length,
    longExact: exact,
    referenceBoundaryMatches: matched,
    selectedLongBoundaries: predicted,
    referenceBoundaries: expected,
    referenceBoundaryPrecision: predicted ? matched / predicted : null,
    referenceBoundaryRecall: expected ? matched / expected : null,
  };
}
