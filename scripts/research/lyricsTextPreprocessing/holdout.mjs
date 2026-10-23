import { createHash } from 'node:crypto';
import { makeInput } from './contract.mjs';
import { makeCondition } from './ablation.mjs';

export const partitionOffsets = (parts) => {
  let offset = 0;
  return parts.slice(0, -1).map((p) => (offset += p.length));
};
const key = (offsets) => JSON.stringify(offsets);
export function referenceCoverage(answer, input) {
  const offered = new Set(input.boundaries.map((b) => b.offset));
  const references = answer.referencePartitions.map((parts) => {
    const offsets = partitionOffsets(parts);
    return {
      offsets,
      covered: offsets.filter((p) => offered.has(p)).length,
      feasible: offsets.every((p) => offered.has(p)),
    };
  });
  return {
    candidateCount: offered.size,
    anyFeasible: references.some((r) => r.feasible),
    references,
  };
}

export function evaluateSplit(answer, row, input) {
  const selected = row?.status === 'accepted' ? row.suggestion.offsets : [];
  const references = answer.referencePartitions.map(partitionOffsets);
  const scored = references
    .map((expected, index) => {
      const matched = selected.filter((p) => expected.includes(p)).length;
      const precision = selected.length
        ? matched / selected.length
        : expected.length
          ? 0
          : 1;
      const recall = expected.length
        ? matched / expected.length
        : selected.length
          ? 0
          : 1;
      return {
        index,
        matched,
        expected: expected.length,
        selected: selected.length,
        precision,
        recall,
        f1:
          precision + recall
            ? (2 * precision * recall) / (precision + recall)
            : 0,
      };
    })
    .sort((a, b) => b.f1 - a.f1 || a.index - b.index);
  let rawIds = [];
  try {
    rawIds = JSON.parse(row?.raw?.choices?.[0]?.message.content).breakIds ?? [];
  } catch {
    /* missing is retained */
  }
  const rawOffsets = Array.isArray(rawIds)
    ? rawIds
        .map((id) => input?.boundaries.find((b) => b.id === id)?.offset)
        .filter(Number.isFinite)
    : [];
  const forbidden = (offsets) => [
    ...new Set(
      answer.forbiddenSpans
        .filter((s) => offsets.some((p) => p > s.start && p < s.end))
        .map((s) => s.reason),
    ),
  ];
  return {
    acceptable:
      row?.status === 'accepted' &&
      references.some((r) => key(r) === key(selected)),
    missing: !row,
    fallback: row?.status === 'fallback',
    selected,
    underCut:
      row?.status === 'accepted' &&
      selected.length < Math.min(...references.map((r) => r.length)),
    overCut:
      row?.status === 'accepted' &&
      selected.length > Math.max(...references.map((r) => r.length)),
    acceptedForbidden: forbidden(selected),
    rawForbidden: forbidden(rawOffsets),
    bestReference: scored[0],
  };
}

export function buildHoldoutSchedule(inputs, answers) {
  const entries = answers.flatMap((answer) => {
    const source = inputs.find((i) => i.lineId === answer.lineId);
    if (!source) throw Error('missing-input');
    const input = {
      ...makeInput(
        { text: source.text, language: source.language },
        source.lineId,
      ),
      lineId: source.lineId,
    };
    const primary = answer.primary === 'split' ? 'C' : 'E';
    return [
      primary,
      ...(answer.joint ? [primary === 'C' ? 'E' : 'C'] : []),
    ].map((arm, index) => ({
      requestId: `${source.lineId}-${arm}`,
      caseId: answer.caseId,
      lineId: source.lineId,
      language: source.language,
      arm,
      kind: arm === 'C' ? 'split' : 'classification',
      cohort: index === 0 ? 'main' : 'joint-extra',
      condition: makeCondition(input, arm),
    }));
  });
  const order = (e) =>
    createHash('sha256')
      .update(`holdout-fixed-order-v1:${e.requestId}`)
      .digest('hex');
  return entries.sort((a, b) => order(a).localeCompare(order(b)));
}

export function validateCorpus(inputs, answers) {
  if (inputs.length !== 100 || answers.length !== 100)
    throw Error('corpus-count');
  if (new Set(inputs.map((i) => i.lineId)).size !== 100)
    throw Error('duplicate-occurrence');
  for (const a of answers) {
    const input = inputs.find((i) => i.lineId === a.lineId);
    if (!input || a.annotationStatus !== 'agent-authored-unreviewed')
      throw Error('authorship-or-source');
    if (!a.referencePartitions.length) throw Error('no-reference');
    const graphemes = new Set(
      [
        ...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(
          input.text,
        ),
      ].map((g) => g.index),
    );
    const seen = new Set();
    for (const parts of a.referencePartitions) {
      if (
        parts.join('') !== input.text ||
        parts.some((p) => !p) ||
        parts.length > 7
      )
        throw Error('reference-reconstruction');
      const offsets = partitionOffsets(parts);
      if (offsets.some((p) => !graphemes.has(p)))
        throw Error('reference-grapheme');
      if (
        a.forbiddenSpans.some((s) =>
          offsets.some((p) => p > s.start && p < s.end),
        )
      )
        throw Error('reference-forbidden');
      if (seen.has(key(offsets))) throw Error('duplicate-reference');
      seen.add(key(offsets));
    }
    for (const s of a.forbiddenSpans)
      if (input.text.slice(s.start, s.end) !== s.text)
        throw Error('span-reconstruction');
    if (
      !Number.isFinite(input.source.startMs) ||
      input.source.endMs <= input.source.startMs
    )
      throw Error('source-time');
  }
  const languages = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'].map((language) => {
    const rows = answers.filter((a) => a.language === language),
      split = rows.filter((a) => a.primary === 'split');
    if (
      rows.length !== 20 ||
      split.length !== 12 ||
      rows.filter((a) => a.joint).length !== 4
    )
      throw Error('language-matrix');
    return {
      language,
      split: split.length,
      classification: rows.length - split.length,
      splitFamilies: new Set(split.map((a) => a.family)).size,
      multipleReferences: split.filter((a) => a.referencePartitions.length > 1)
        .length,
    };
  });
  const pairs = [...new Set(answers.map((a) => a.pair).filter(Boolean))];
  for (const pair of pairs) {
    const group = answers.filter((a) => a.pair === pair);
    if (
      group.length !== 2 ||
      group.some((a) => a.expectedKind !== 'unresolvable') ||
      new Set(group.map((a) => a.hiddenIntent)).size !== 2 ||
      new Set(group.map((a) => inputs.find((i) => i.lineId === a.lineId).text))
        .size !== 1
    )
      throw Error('identical-pair');
  }
  return {
    occurrences: inputs.length,
    uniqueTexts: new Set(inputs.map((i) => i.text)).size,
    languages,
    indistinguishablePairs: pairs.length,
  };
}
