'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const {
  sha,
  fileHash,
  bindCandidate,
} = require('../lyricsAlignmentCandidates/assets.cjs');
const {
  plannedWindows,
  readAsrWindow,
  validateFrozenCases,
} = require('../lyricsAlignmentCandidates/qualityRun.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { textCuts, scoreCuts } = require('../lyricsAcoustic/protocol.cjs');
const {
  presentationLineSegments,
} = require('../../../shared/presentation/state.mjs');
const { validateCandidate, validateKey } = require('./review.cjs');
const {
  acousticEstimatePath,
  loadTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const {
  findStructuredAudioFilename,
} = require('../../../electron/lib/library/paths');
async function validateStoredCase(dir, item, prior) {
  const filename = prior.canonical.source.filename,
    source = { filename, kind: 'manual', offsetMs: item.offsetMs ?? 0 };
  const side = JSON.parse(read(acousticEstimatePath(dir, filename))),
    audio = findStructuredAudioFilename(dir);
  if (
    !audio ||
    JSON.stringify(
      await loadTrackAcousticEstimate(dir, source, { method: side.method }),
    ) !== JSON.stringify(prior.estimate) ||
    (await fileHash(path.join(dir, audio))) !== side.audio.sha256 ||
    (await fileHash(path.join(dir, 'lyrics', filename))) !==
      prior.canonical.source.sha256 ||
    prior.canonical.lines.some((l, i) =>
      ['lineId', 'text', 'startMs', 'endMs'].some(
        (k) => l[k] !== side.lines[i]?.[k],
      ),
    )
  )
    throw Error('stored replay context');
  return side;
}
const { checkLowCost, timingChunks, lowCostRules } = require('./lowCost.cjs');
const profiles = ['baseline', 'script-fold', 'neighbor-rescue', 'advisory'];
const read = (f) => {
  if (fs.statSync(f).size > 16777216) throw Error('replay budget');
  return fs.readFileSync(f);
};
function aggregate(rows) {
  const errors = rows.flatMap((r) => r.errorsMs).sort((a, b) => a - b),
    scorable = rows.reduce((n, r) => n + r.scorable, 0);
  return {
    requested: rows.reduce((n, r) => n + r.requested, 0),
    scorable,
    measured: errors.length,
    missing: scorable - errors.length,
    within100: errors.filter((e) => e <= 100).length,
    over500: errors.filter((e) => e > 500).length,
    over1000: errors.filter((e) => e > 1000).length,
    p90Ms: errors.length ? errors[Math.ceil(errors.length * 0.9) - 1] : null,
  };
}
async function replay(batch, bindings) {
  const input = read(batch.cases),
    refs = batch.refs ? read(batch.refs) : null,
    qb = read(path.join(batch.qwen, 'results.json')),
    sb = read(path.join(batch.small, 'results.json')),
    items = JSON.parse(input),
    q = JSON.parse(qb),
    s = JSON.parse(sb);
  if (
    q.inputSha256 !== sha(input) ||
    q.referenceSha256 !== (refs ? sha(refs) : null) ||
    q.method.modelManifestSha256 !== bindings.qwen.method.modelManifestSha256 ||
    s.method.modelManifestSha256 !== bindings.small.method.modelManifestSha256
  )
    throw Error('replay input/model');
  validateFrozenCases(items, q, { small: s });
  const collected = Object.fromEntries(profiles.map((p) => [p, []])),
    stats = Object.fromEntries(profiles.map((p) => [p, []]));
  for (let i = 0; i < items.length; i++) {
    const item = items[i],
      old = q.cases[i],
      canonical = old.canonical;
    const qside = await validateStoredCase(
        path.join(batch.qwen, item.id),
        item,
        old,
      ),
      sside = await validateStoredCase(
        path.join(batch.small, item.id),
        item,
        s.cases[i],
      );
    if (qside.audio.sha256 !== sside.audio.sha256)
      throw Error('replay paired audio');
    const planned = plannedWindows(item, canonical),
      windows = [];
    for (const w of planned) {
      const record = s.cases[i].metrics.windows.find(
        (r) => r.index === w.index,
      );
      windows.push(
        record?.raw
          ? {
              ...w,
              ...readAsrWindow(
                batch.config.small,
                'small',
                { method: s.method, metrics: s.cases[i].metrics },
                bindings.small.method,
                planned,
                w,
                item.language,
                w.endMs - w.startMs,
              ),
            }
          : { ...w, spans: [], missing: true },
      );
    }
    for (const profile of profiles) {
      const decisions = canonical.lines.map((line) => {
        const w = windows.find((w) => w.lineIds.includes(line.lineId));
        return w && !w.missing
          ? checkLowCost(
              line,
              {
                language: item.language,
                windowStartMs: w.startMs,
                offsetMs: item.offsetMs ?? 0,
                durationMs: w.endMs - w.startMs,
                spans: w.spans,
              },
              profile,
            )
          : { reject: false, missing: true, state: 'unknown' };
      });
      const lines = old.estimate.preview.lines.map((line, j) =>
        decisions[j].reject
          ? {
              ...line,
              status: 'unsupported',
              reason: 'missing-boundaries',
              chunks: [],
            }
          : line,
      );
      collected[profile].push({
        ...old,
        estimate: {
          ...old.estimate,
          preview: { ...old.estimate.preview, lines },
        },
      });
      stats[profile].push({
        id: item.id,
        variant: item.variant,
        targetIndex: item.targetIndex,
        decisions,
      });
    }
  }
  const results = {};
  for (const profile of profiles) {
    const scored = scoreResults(
      items,
      collected[profile],
      refs ? JSON.parse(refs) : {},
    );
    results[profile] = {
      readyLines: collected[profile].reduce(
        (n, c) =>
          n +
          c.estimate.preview.lines.filter((l) => l.status === 'ready').length,
        0,
      ),
      normalReady: collected[profile]
        .filter((c) => c.variant === 'normal')
        .reduce(
          (n, c) =>
            n +
            c.estimate.preview.lines.filter((l) => l.status === 'ready').length,
          0,
        ),
      contentRejections: stats[profile]
        .flatMap((s) => s.decisions)
        .filter((d) => d.reject).length,
      score: aggregate(scored.flatMap((c) => c.rows.map((r) => r.D))),
      stats: stats[profile],
      caseReady: collected[profile].map((c) => ({
        id: c.id,
        ready: c.estimate.preview.lines.filter((l) => l.status === 'ready')
          .length,
      })),
      constructedTargets: items
        .filter((c) => Number.isInteger(c.targetIndex))
        .map((item) => ({
          id: item.id,
          ready:
            collected[profile].find((c) => c.id === item.id).estimate.preview
              .lines[item.targetIndex].status === 'ready',
        })),
    };
  }
  return {
    inputSha256: sha(input),
    referenceSha256: refs ? sha(refs) : null,
    qwenResultsSha256: sha(qb),
    smallResultsSha256: sha(sb),
    results,
  };
}
async function run(root, captureRoot, output) {
  if (!path.isAbsolute(output) || fs.existsSync(output))
    throw Error('new replay output');
  const config = JSON.parse(read(path.join(root, 'config.json'))),
    manifest = JSON.parse(read(config.manifest)),
    bindings = {
      qwen: await bindCandidate('qwen', config.qwen, manifest.qwen),
      small: await bindCandidate('small', config.small, manifest.small),
    };
  const sourceFiles = [
      __filename,
      require.resolve('./lowCost.cjs'),
      require.resolve('./content.cjs'),
      require.resolve('./review.cjs'),
      require.resolve('./diagnoseQwen.cjs'),
      require.resolve('opencc-js/t2cn'),
    ],
    sourceHashes = await Promise.all(sourceFiles.map(fileHash));
  const fresh = await replay(
    {
      config,
      cases: path.join(root, 'cases.json'),
      refs: path.join(root, 'references.json'),
      qwen: path.join(root, 'qwen'),
      small: path.join(root, 'small'),
    },
    bindings,
  );
  const priorConfig = JSON.parse(read('tasks/lyrics-alt-onset-config.json'));
  const older = await replay(
    {
      config: priorConfig,
      cases: 'tasks/acoustic-phase2-cases.json',
      refs: 'tasks/acoustic-phase2-references.json',
      qwen: '.tmp/lyrics-alt/runs/qwen-final',
      small: '.tmp/lyrics-alt/runs/small-onset',
    },
    bindings,
  );
  const stress = await replay(
    {
      config: priorConfig,
      cases: 'tasks/acoustic-phase2-negative-cases.json',
      refs: null,
      qwen: '.tmp/lyrics-alt/runs/qwen-negative',
      small: '.tmp/lyrics-alt/runs/small-onset-negative',
    },
    bindings,
  );
  const cb = read(path.join(captureRoot, 'evidence.json')),
    capture = JSON.parse(cb),
    cqb = read(path.join(captureRoot, 'results.json')),
    cq = JSON.parse(cqb),
    originalBytes = read(path.join(root, 'qwen/results.json')),
    referenceBytes = read(path.join(root, 'references.json')),
    originals = JSON.parse(originalBytes).cases.filter(
      (c) => c.variant === 'normal',
    ),
    references = JSON.parse(referenceBytes),
    timing = [];
  if (
    capture.inputSha256 !== fresh.inputSha256 ||
    sha(originalBytes) !== fresh.qwenResultsSha256 ||
    sha(referenceBytes) !== fresh.referenceSha256 ||
    capture.priorResultsSha256 !== fresh.qwenResultsSha256 ||
    capture.cases.length !== 4 ||
    capture.cases.some((c) => !c.originalPredictionReproduced) ||
    cq.inputSha256 !== fresh.inputSha256 ||
    cq.referenceSha256 !== fresh.referenceSha256 ||
    JSON.stringify(capture.method) !== JSON.stringify(cq.method) ||
    capture.method.modelManifestSha256 !==
      bindings.qwen.method.modelManifestSha256 ||
    capture.codeSha256 !==
      (await fileHash(require.resolve('./diagnoseQwen.cjs'))) ||
    cq.cases.length !== originals.length ||
    new Set(cq.cases.map((c) => c.id)).size !== originals.length ||
    new Set(capture.cases.map((c) => c.id)).size !== originals.length ||
    cq.cases.some((c) => {
      const old = originals.find((o) => o.id === c.id);
      return (
        !old ||
        JSON.stringify(old.canonical) !== JSON.stringify(c.canonical) ||
        JSON.stringify(old.estimate.preview.lines) !==
          JSON.stringify(c.estimate.preview.lines)
      );
    })
  )
    throw Error('capture reproduction');
  for (const profile of [
    'captured-exact',
    'span-interpolation',
    'disagreement-fallback',
  ]) {
    const rows = [],
      details = [];
    for (const old of cq.cases) {
      const side = await validateCandidate(
          path.join(captureRoot, old.id),
          { id: old.id, offsetMs: 0 },
          old,
        ),
        e = capture.cases.find((c) => c.id === old.id);
      if (
        e.audioSha256 !== side.audio.sha256 ||
        e.canonicalSha256 !== sha(JSON.stringify(old.canonical))
      )
        throw Error('captured source changed');
      const baseline = old.canonical.lines.map((line, i) => {
        const p = presentationLineSegments(
            {
              lyrics: { synced: true, offsetMs: 0 },
              playback: { durationMs: 30000 },
            },
            old.canonical.lines,
            i,
          ),
          starts = new Map();
        let from = line.text.length - line.text.trimStart().length;
        for (const part of p?.segments ?? []) {
          starts.set(from, part.startMs);
          from += part.text.length;
        }
        return starts;
      });
      const chunks = timingChunks(
        old.canonical,
        old.language,
        e.windows,
        old.metrics.windows,
        profile,
        baseline,
        plannedWindows(
          { language: old.language, durationMs: 30000, offsetMs: 0 },
          old.canonical,
        ),
      );
      if (
        profile === 'captured-exact' &&
        chunks.some(
          (c, i) =>
            JSON.stringify(c ?? []) !==
            JSON.stringify(old.estimate.preview.lines[i].chunks),
        )
      )
        throw Error('raw original mapping reproduction');
      old.canonical.lines.forEach((line, i) => {
        const ref = new Map(
            (references[old.id][line.lineId] ?? []).map((r) => [
              r.from,
              r.startMs,
            ]),
          ),
          pred = new Map((chunks[i] ?? []).map((c) => [c.from, c.startMs])),
          score = scoreCuts(textCuts(line.text, old.language), ref, pred);
        rows.push(score);
        details.push({
          caseId: old.id,
          lineIndex: i,
          score,
          chunks: chunks[i] ?? [],
        });
      });
    }
    timing.push({ profile, score: aggregate(rows), details });
  }
  const packet = path.join(root, 'human-review'),
    mb = read(path.join(packet, 'manifest.json')),
    pm = JSON.parse(mb),
    key = JSON.parse(read(path.join(root, 'review-key.json')));
  if (sha(mb) !== key.manifestSha256) throw Error('priority manifest');
  if (
    pm.corpusSha256 !== fresh.inputSha256 ||
    pm.resultSha256.qwen !== fresh.qwenResultsSha256 ||
    pm.resultSha256.small !==
      (await fileHash(path.join(root, 'qwen-small/results.json')))
  )
    throw Error('priority current receipts');
  validateKey(pm, key);
  for (const sample of pm.samples)
    if (
      !/^audio\/r-\d{3}\.wav$/.test(sample.audio) ||
      (await fileHash(path.join(packet, sample.audio))) !== sample.audioSha256
    )
      throw Error('priority audio');
  const picks = [
    [
      'zh-2-normal',
      6,
      'P0',
      'small normal rejection: script and T1/ASR clock mismatch',
    ],
    ['ja-1-normal', 7, 'P0', 'two model onsets >800ms from provider'],
    ['ja-1-normal', 6, 'P0', 'four missing internal cuts and >500ms tail'],
    ['ja-1-normal', 5, 'P0', 'model onset later than provider by 677ms'],
    ['ja-2-normal', 6, 'P0', 'inflection onset early by 643ms'],
    [
      'ja-1-normal',
      4,
      'P1',
      'model first spans precede T1 and long/zero duration',
    ],
    ['ja-1-normal', 8, 'P1', 'repeated phrase and missing internal cut'],
    ['ja-2-normal', 4, 'P1', 'control: Qwen improves baseline >1s tail'],
    [
      'ja-1-normal',
      1,
      'P1',
      'control: mixed-script policy decline, not model error',
    ],
    ...['zh-1', 'zh-2', 'ja-2'].map((id) => [
      `${id}-phrase-mismatch`,
      1,
      'P1',
      'control: retain mismatch detection after normalization',
    ]),
  ];
  const priority = picks.map(([caseId, lineIndex, level, reason]) => {
    const k = key.rows.find(
      (k) => k.caseId === caseId && k.lineIndex === lineIndex,
    );
    if (!k) throw Error('priority sample missing');
    const sample = pm.samples.find((s) => s.sampleId === k.sampleId);
    return {
      sampleId: k.sampleId,
      caseId,
      lineIndex,
      priority: level,
      reason,
      startMs: sample.startMs,
      endMs: sample.endMs,
      audioSha256: sample.audioSha256,
      reviewed: false,
    };
  });
  await bindings.qwen.assertCurrent();
  await bindings.small.assertCurrent();
  for (let i = 0; i < sourceFiles.length; i++)
    if ((await fileHash(sourceFiles[i])) !== sourceHashes[i])
      throw Error('replay code changed');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        kind: 'exploratory pure postprocess; not persisted product estimates',
        profiles,
        rules: lowCostRules,
        sourceHashes,
        captureSha256: sha(cb),
        captureResultsSha256: sha(cqb),
        fresh,
        older,
        stress,
        timing,
        priority,
        humanPacketSha256: sha(mb),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(output, 'PRIORITY.md'),
    `# 優先人工抽查\n\n先查 P0，再查 P1，全部仍 pending。使用原 labels.json 填標記，不要以本文件診斷代替聽查。原 A/B 候選不改，先獨立標起音，再看研究補切。此清單已揭露風險原因，是 root-cause 定向抽查，不能當隨機盲測或人口誤接受率。\n\n${priority.map((p) => `- ${p.priority} ${p.sampleId}：[音訊](../../lyrics-new-eval/human-review/audio/${p.sampleId}.wav)，${p.startMs}–${p.endMs}ms；${p.reason}。`).join('\n')}\n`,
  );
  console.log(
    JSON.stringify({
      fresh: Object.fromEntries(
        profiles.map((p) => [
          p,
          {
            normal: fresh.results[p].normalReady,
            rejections: fresh.results[p].contentRejections,
            target: fresh.results[p].constructedTargets,
          },
        ]),
      ),
      older: Object.fromEntries(
        profiles.map((p) => [
          p,
          { ready: older.results[p].readyLines, score: older.results[p].score },
        ]),
      ),
      stress: Object.fromEntries(
        profiles.map((p) => [p, stress.results[p].caseReady]),
      ),
      timing: timing.map((t) => ({ profile: t.profile, score: t.score })),
      priority: priority.length,
    }),
  );
}
if (require.main === module)
  run(...process.argv.slice(2)).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
module.exports = { aggregate, replay, run };
