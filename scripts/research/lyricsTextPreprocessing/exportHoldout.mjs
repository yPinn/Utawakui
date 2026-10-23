// Post-run scoring. Never imports the authoring CLI or mutates frozen manifests.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateSplit, partitionOffsets } from './holdout.mjs';
import { validateCondition } from './ablation.mjs';
import { describeNumbers } from './score.mjs';

const root = 'tasks/lyrics-text-holdout-20261023',
  data = 'docs/research/lyrics-text-holdout';
const read = (p) =>
  JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/u, ''));
const hash = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (!fs.existsSync(`${root}/summary.json`)) throw Error('run-not-finished');
const protocol = read(`${root}/protocol.json`),
  summary = read(`${root}/summary.json`);
for (const [p, h] of Object.entries(protocol.authoredHashes))
  if (hash(p) !== h) throw Error('authored-data-drift');
const inputs = read(`${data}/inputs-2026-10-23.json`).cases,
  answers = read(`${data}/answers-2026-10-23.json`).cases;
const timeControls = read(`${data}/time-controls-2026-10-23.json`).cases;
const files = fs.readdirSync(root).filter((f) => f.endsWith('.result.json'));
const rows = files.map((f) => read(`${root}/${f}`));
const rowFor = (e) => rows.find((r) => r.requestId === e.requestId);
const raw = (r) => {
  try {
    return JSON.parse(r.raw.choices[0].message.content);
  } catch {
    return null;
  }
};
const kind = (r) =>
  ['lyric', 'ambiguous', 'credit-candidate'].includes(raw(r)?.kind)
    ? raw(r).kind
    : null;
const sourceFor = (e) => inputs.find((i) => i.lineId === e.lineId);
const answerFor = (e) => answers.find((a) => a.lineId === e.lineId);
const cost = (entries) => {
  const chosen = entries.map(rowFor).filter(Boolean);
  return {
    scheduled: entries.length,
    recorded: chosen.length,
    generationStarted: chosen.filter((r) => r.generationStarted).length,
    completedWithUsage: chosen.filter((r) => r.raw?.usage).length,
    partial: chosen.filter((r) => r.generationStarted && !r.raw?.usage).length,
    preflightSkipped: chosen.filter((r) => !r.generationStarted).length,
    missing: entries.length - chosen.length,
    wallMs: describeNumbers(chosen.map((r) => r.wallMs)),
    firstContentTokenMs: describeNumbers(
      chosen.map((r) => r.raw?.firstContentTokenMs),
    ),
    inputTokens: describeNumbers(
      chosen.map((r) => r.raw?.usage?.prompt_tokens),
    ),
    outputTokens: describeNumbers(
      chosen.map((r) => r.raw?.usage?.completion_tokens),
    ),
    cpuSecondsBracket: describeNumbers(chosen.map((r) => r.cpuSecondsBracket)),
  };
};
const splitSummary = (entries) => {
  const details = entries.map((e) => ({
    e,
    result: evaluateSplit(answerFor(e), rowFor(e), e.condition.input),
  }));
  const families = [...new Set(entries.map((e) => answerFor(e).family))];
  return {
    scheduled: entries.length,
    accepted: entries.filter((e) => rowFor(e)?.status === 'accepted').length,
    fallback: entries.filter((e) => rowFor(e)?.status === 'fallback').length,
    missing: details.filter((d) => d.result.missing).length,
    acceptable: details.filter((d) => d.result.acceptable).length,
    anyReferenceFeasible: entries.filter(
      (e) =>
        protocol.coverage.find((c) => c.requestId === e.requestId)?.anyFeasible,
    ).length,
    underCut: details.filter((d) => d.result.underCut).length,
    overCut: details.filter((d) => d.result.overCut).length,
    acceptedForbidden: details.filter((d) => d.result.acceptedForbidden.length)
      .length,
    rawForbidden: details.filter((d) => d.result.rawForbidden.length).length,
    bestReferenceF1: describeNumbers(
      details.map((d) =>
        rowFor(d.e)?.status === 'accepted' ? d.result.bestReference.f1 : 0,
      ),
    ),
    families: families.length,
    familiesAllVariantsAcceptable: families.filter((f) =>
      details
        .filter((d) => answerFor(d.e).family === f)
        .every((d) => d.result.acceptable),
    ).length,
  };
};
const classificationSummary = (entries) => {
  const credits = entries.filter(
    (e) => answerFor(e).expectedKind === 'credit-candidate',
  );
  const sung = entries.filter((e) => answerFor(e).expectedKind === 'lyric');
  const mixed = entries.filter((e) => answerFor(e).mixed);
  const indistinguishable = entries.filter((e) => answerFor(e).pair);
  const tp = credits.filter(
      (e) => kind(rowFor(e)) === 'credit-candidate',
    ).length,
    fp = sung.filter((e) => kind(rowFor(e)) === 'credit-candidate').length;
  return {
    scheduled: entries.length,
    recorded: entries.filter((e) => rowFor(e)).length,
    accepted: entries.filter((e) => rowFor(e)?.status === 'accepted').length,
    fallback: entries.filter((e) => rowFor(e)?.status === 'fallback').length,
    missing: entries.filter((e) => !rowFor(e)).length,
    unclassified: entries.filter((e) => !kind(rowFor(e))).length,
    credits: credits.length,
    rawCreditsCandidate: tp,
    sung: sung.length,
    rawSungFalseCandidates: fp,
    rawSungAbstentions: sung.filter((e) => kind(rowFor(e)) === 'ambiguous')
      .length,
    candidatePrecisionIdentifiable: tp + fp ? tp / (tp + fp) : null,
    candidateRecallIdentifiable: credits.length ? tp / credits.length : null,
    mixed: mixed.length,
    mixedAmbiguous: mixed.filter((e) => kind(rowFor(e)) === 'ambiguous').length,
    mixedCreditCandidates: mixed.filter(
      (e) => kind(rowFor(e)) === 'credit-candidate',
    ).length,
    indistinguishableOccurrences: indistinguishable.length,
    indistinguishableKinds: Object.fromEntries(
      ['lyric', 'ambiguous', 'credit-candidate'].map((k) => [
        k,
        indistinguishable.filter((e) => kind(rowFor(e)) === k).length,
      ]),
    ),
  };
};
const mainC = protocol.schedule.filter(
    (e) => e.cohort === 'main' && e.arm === 'C',
  ),
  mainE = protocol.schedule.filter((e) => e.cohort === 'main' && e.arm === 'E');
const languageGroups = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'];
const comparators = ['no-cut', 'punctuation-only'].map((name) => {
  const details = mainC.map((e) => {
    const breaks =
      name === 'no-cut'
        ? []
        : e.condition.input.boundaries
            .filter((b) =>
              /[,，、。！？!?;；:：]\s*$/u.test(
                e.condition.input.text.slice(0, b.offset),
              ),
            )
            .slice(0, 6)
            .map((b) => b.id);
    let row;
    try {
      row = {
        status: 'accepted',
        suggestion: validateCondition(e.condition, {
          lineId: e.lineId,
          breakIds: breaks,
        }),
      };
    } catch (error) {
      row = {
        status: 'fallback',
        error: error.message,
        suggestion: { offsets: [] },
      };
    }
    return {
      lineId: e.lineId,
      language: e.language,
      acceptable: evaluateSplit(answerFor(e), row, e.condition.input)
        .acceptable,
      status: row.status,
      offsets: row.suggestion.offsets,
    };
  });
  return {
    name,
    scheduled: 60,
    acceptable: details.filter((d) => d.acceptable).length,
    languages: languageGroups.map((language) => ({
      language,
      acceptable: details.filter((d) => d.language === language && d.acceptable)
        .length,
      scheduled: 12,
    })),
    details,
    sameRecordedSubset: {
      scheduled: mainC.filter((e) => rowFor(e)).length,
      acceptable: details.filter(
        (d) => d.acceptable && rowFor(mainC.find((e) => e.lineId === d.lineId)),
      ).length,
    },
  };
});
const pairs = [...new Set(answers.map((a) => a.pair).filter(Boolean))].map(
  (pair) => {
    const pairAnswers = answers.filter((a) => a.pair === pair),
      entries = pairAnswers.map((a) =>
        mainE.find((e) => e.lineId === a.lineId),
      );
    const kinds = entries.map((e) => kind(rowFor(e)));
    return {
      pair,
      kinds,
      consistent: kinds.every((k) => k !== null && k === kinds[0]),
      bothAmbiguous: kinds.every((k) => k === 'ambiguous'),
      occurrences: entries.map((e, i) => ({
        lineId: e.lineId,
        hiddenIntent: pairAnswers[i].hiddenIntent,
        rawKind: kinds[i],
        status: rowFor(e)?.status ?? 'missing',
      })),
    };
  },
);
const whitespace = languageGroups.map((language) => {
  const entries = mainC.filter((e) =>
    answerFor(e).caseId.startsWith(`${language}-M1`),
  );
  const versions = entries.map((e) => {
    const row = rowFor(e),
      source = sourceFor(e);
    return {
      caseId: e.caseId,
      sourceText: source.text,
      status: row?.status ?? 'missing',
      acceptable: evaluateSplit(answerFor(e), row, e.condition.input)
        .acceptable,
      offsets: row?.suggestion.offsets ?? null,
      semanticOffsets:
        row?.status === 'accepted'
          ? row.suggestion.offsets.map(
              (p) => source.text.slice(0, p).replace(/\s/gu, '').length,
            )
          : null,
    };
  });
  return {
    language,
    uniqueTexts: new Set(versions.map((v) => v.sourceText)).size,
    allAccepted: versions.every((v) => v.status === 'accepted'),
    sameSemanticOffsets: versions.every(
      (v) =>
        v.semanticOffsets !== null &&
        JSON.stringify(v.semanticOffsets) ===
          JSON.stringify(versions[0].semanticOffsets),
    ),
    versions,
  };
});
const joint = answers
  .filter((a) => a.joint)
  .map((a) => {
    const split = protocol.schedule.find(
        (e) => e.lineId === a.lineId && e.arm === 'C',
      ),
      classification = protocol.schedule.find(
        (e) => e.lineId === a.lineId && e.arm === 'E',
      );
    return {
      caseId: a.caseId,
      lineId: a.lineId,
      expectedKind: a.expectedKind ?? 'lyric',
      split: evaluateSplit(a, rowFor(split), split.condition.input),
      rawKind: kind(rowFor(classification)),
      classificationStatus: rowFor(classification)?.status ?? 'missing',
    };
  });
const life = read(`${root}/lifecycle.json`),
  samples = fs
    .readFileSync(`${root}/samples.ndjson`, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
const result = {
  date: '2026-10-23',
  scope: protocol.scope,
  nativeReview: 'pending',
  nativeReviewedCases: 0,
  nativeAcceptability: null,
  notIndependentHumanReview: true,
  summary,
  failures: rows
    .filter((r) => r.status === 'fallback')
    .map((r) => ({
      requestId: r.requestId,
      caseId: r.caseId,
      error: r.error,
      wallMs: r.wallMs,
      inputTokensPreflight: r.inputTokensPreflight,
      firstContentTokenMs: r.raw?.firstContentTokenMs ?? null,
      partialContent: r.raw?.choices?.[0]?.message.content ?? null,
      finishReason: r.raw?.choices?.[0]?.finish_reason ?? null,
      usage: r.raw?.usage ?? null,
      cpuSecondsBracket: r.cpuSecondsBracket,
    })),
  corpus: protocol.corpus,
  limits: protocol.limits,
  asset: protocol.asset,
  runtime: protocol.runtime,
  main: {
    split: splitSummary(mainC),
    classification: classificationSummary(mainE),
    languages: languageGroups.map((language) => ({
      language,
      split: splitSummary(mainC.filter((e) => e.language === language)),
      classification: classificationSummary(
        mainE.filter((e) => e.language === language),
      ),
      splitCost: cost(mainC.filter((e) => e.language === language)),
      classificationCost: cost(mainE.filter((e) => e.language === language)),
    })),
  },
  comparators,
  joint,
  whitespace,
  pairs,
  timeControls: timeControls.map((t) => {
    const entry = protocol.schedule.find(
      (e) => e.lineId === t.lineId && e.arm === 'C',
    );
    const row = rowFor(entry);
    return {
      ...t,
      splitInferenceRequests: row?.generationStarted ? 1 : 0,
      splitStatus: row?.status ?? 'missing',
      additionalModelRequests: 0,
      reusedTextResult: Boolean(row),
      newVocalTiming: null,
    };
  }),
  cost: {
    mainSplit: cost(mainC),
    mainClassification: cost(mainE),
    extraSplit: cost(
      protocol.schedule.filter(
        (e) => e.cohort === 'joint-extra' && e.arm === 'C',
      ),
    ),
    extraClassification: cost(
      protocol.schedule.filter(
        (e) => e.cohort === 'joint-extra' && e.arm === 'E',
      ),
    ),
  },
  sharedProcess: {
    startupMs: life.readyAt - life.startedAt,
    serverCpuSeconds: life.lastSample?.cpuSeconds,
    samplerCpuSeconds: life.lastSample?.samplerCpuSeconds,
    runnerCpuSeconds:
      (life.lastSample.runnerCpu.user + life.lastSample.runnerCpu.system) / 1e6,
    peakWorkingSet: Math.max(...samples.map((s) => s.peakWorkingSet)),
    peakSampledPrivateBytes: Math.max(...samples.map((s) => s.privateBytes)),
    peakCombinedConservativeBytes: Math.max(
      ...samples.map(
        (s) =>
          Math.max(s.privateBytes, s.workingSet) +
          s.runnerRss +
          Math.max(s.samplerPrivateBytes, s.samplerWorkingSet),
      ),
    ),
    sampleCount: samples.length,
    sampleGapMs: describeNumbers(
      samples.slice(1).map((s, i) => s.at - samples[i].at),
    ),
    serverExited: life.serverExited,
    samplerExited: life.samplerExited,
  },
  cases: protocol.schedule.map((e) => {
    const r = rowFor(e),
      a = answerFor(e),
      source = sourceFor(e);
    return {
      requestId: e.requestId,
      caseId: e.caseId,
      lineId: e.lineId,
      language: e.language,
      cohort: e.cohort,
      arm: e.arm,
      text: source.text,
      source: source.source,
      referencePartitions: a.referencePartitions,
      referenceOffsets: a.referencePartitions.map(partitionOffsets),
      forbiddenSpans: a.forbiddenSpans,
      expectedKind: a.expectedKind ?? null,
      payload: e.condition.payload,
      candidates: e.condition.input.boundaries,
      status: r?.status ?? 'missing',
      error: r?.error ?? null,
      rawDecision: raw(r),
      rawContent: r?.raw?.choices?.[0]?.message.content ?? null,
      suggestion: r?.suggestion ?? null,
      ...(e.arm === 'C'
        ? {
            splitEvaluation: evaluateSplit(a, r, e.condition.input),
            coverage: protocol.coverage.find(
              (c) => c.requestId === e.requestId,
            ),
          }
        : {}),
      wallMs: r?.wallMs ?? null,
      inputTokens: r?.raw?.usage?.prompt_tokens ?? null,
      outputTokens: r?.raw?.usage?.completion_tokens ?? null,
    };
  }),
  receipts: {
    exporterSha256: hash(new URL(import.meta.url)),
    protocolSha256: hash(`${root}/protocol.json`),
    authoredHashes: protocol.authoredHashes,
    sourceHashes: protocol.sourceHashes,
    resultHashes: Object.fromEntries(
      files.map((f) => [f, hash(`${root}/${f}`)]),
    ),
    samplesSha256: hash(`${root}/samples.ndjson`),
  },
};
fs.writeFileSync(
  'docs/research/lyrics-text-holdout-results-2026-10-23.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      main: result.main,
      comparators: comparators.map((c) => ({
        name: c.name,
        acceptable: c.acceptable,
        languages: c.languages,
      })),
      cost: result.cost,
      sharedProcess: result.sharedProcess,
      summary,
    },
    null,
    2,
  ),
);
