'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { sha, fileHash } = require('../lyricsAlignmentCandidates/assets.cjs');
const {
  plannedWindows,
  readAsrWindow,
} = require('../lyricsAlignmentCandidates/qualityRun.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
const {
  assertMatched,
  applyContentMask,
  aggregateRows,
} = require('./hubertComparison.cjs');
const { validateCandidate } = require('./review.cjs');
const { checkLowCost } = require('./lowCost.cjs');
const { assessCompleteness, completenessRules } = require('./completeness.cjs');
const read = (file) => {
  if (fs.statSync(file).size > 16777216)
    throw Error('completeness receipt budget');
  return fs.readFileSync(file);
};
async function loadFresh(root) {
  if (!path.isAbsolute(root)) throw Error('absolute research root required');
  const comparison = JSON.parse(
    read(path.join(root, 'hubertfa-comparison/comparison.json')),
  );
  const publicReceipt = JSON.parse(
    read('docs/research/data/lyrics-hubertfa-fresh-2026-10-19.json'),
  );
  if (!isDeepStrictEqual(comparison, publicReceipt))
    throw Error('public comparison receipt changed');
  const ib = read(path.join(root, 'cases.json')),
    rb = read(path.join(root, 'references.json'));
  if (
    sha(ib) !== comparison.inputSha256 ||
    sha(rb) !== comparison.referenceSha256
  )
    throw Error('completeness frozen corpus');
  const items = JSON.parse(ib),
    refs = JSON.parse(rb),
    candidates = {};
  for (const kind of ['qwen', 'hubertfa', 'small']) {
    const bytes = read(path.join(root, kind, 'results.json'));
    if (sha(bytes) !== comparison.rawResultsSha256[kind])
      throw Error('completeness result changed');
    candidates[kind] = JSON.parse(bytes);
    if (!isDeepStrictEqual(candidates[kind].method, comparison.models[kind]))
      throw Error('completeness method changed');
  }
  assertMatched(items, candidates.hubertfa, candidates.qwen);
  assertMatched(items, candidates.hubertfa, candidates.small);
  for (let i = 0; i < items.length; i++) {
    const sides = [];
    for (const kind of ['qwen', 'hubertfa', 'small']) {
      const side = await validateCandidate(
        path.join(root, kind, items[i].id),
        items[i],
        candidates[kind].cases[i],
      );
      if (!isDeepStrictEqual(side.method, candidates[kind].method))
        throw Error('completeness sidecar method');
      sides.push(side);
    }
    if (sides.some((s) => s.audio.sha256 !== sides[0].audio.sha256))
      throw Error('completeness paired audio');
  }
  for (const [file, expected] of Object.entries(comparison.productionHashes))
    if ((await fileHash(file)) !== expected) throw Error('formal gate changed');
  return { comparison, items, refs, candidates };
}
async function run(root, output) {
  if (!path.isAbsolute(output) || fs.existsSync(output))
    throw Error('new absolute completeness output required');
  const { comparison, items, refs, candidates } = await loadFresh(root);
  const config = JSON.parse(read(path.join(root, 'config.json')));
  const profiles = [
    'baseline',
    'script-fold',
    'same-script',
    'insertion-gate-control',
  ];
  const stats = Object.fromEntries(profiles.map((p) => [p, []]));
  const rawHashes = [];
  const labelsFile = path.join(root, 'human-review/labels.json'),
    labelsSha256 = await fileHash(labelsFile);
  const sourceFiles = [
    __filename,
    require.resolve('./completeness.cjs'),
    require.resolve('./lowCost.cjs'),
    require.resolve('./content.cjs'),
    require.resolve('./hubertComparison.cjs'),
    require.resolve('./review.cjs'),
    require.resolve('../lyricsAcoustic/evaluate.cjs'),
    require.resolve('../lyricsAcoustic/protocol.cjs'),
    require.resolve('../lyricsAlignmentCandidates/qualityRun.cjs'),
    require.resolve('../lyricsAlignmentCandidates/tokenStartReplay.cjs'),
    require.resolve('opencc-js/t2cn'),
    require.resolve('wanakana'),
  ];
  const sourceHashes = await Promise.all(sourceFiles.map(fileHash));
  for (let i = 0; i < items.length; i++) {
    const item = items[i],
      prior = candidates.small.cases[i],
      planned = plannedWindows(item, prior.canonical);
    const windows = planned.map((w) => {
      const record = prior.metrics.windows.find((r) => r.index === w.index);
      if (!record?.raw) return { ...w, missing: true, spans: [] };
      const evidence = readAsrWindow(
        config.small,
        'small',
        { method: candidates.small.method, metrics: prior.metrics },
        candidates.small.method,
        planned,
        w,
        item.language,
        w.endMs - w.startMs,
      );
      rawHashes.push({
        caseId: item.id,
        windowIndex: w.index,
        sha256: evidence.sha256,
      });
      return { ...w, ...evidence };
    });
    for (const profile of profiles) {
      const decisions = prior.canonical.lines.map((line) => {
        const w = windows.find((w) => w.lineIds.includes(line.lineId));
        if (!w || w.missing)
          return {
            reject: false,
            state: 'unknown',
            insertionWarning: false,
            insertionState: 'unknown',
            missing: true,
          };
        const evidence = {
          language: item.language,
          windowStartMs: w.startMs,
          offsetMs: item.offsetMs ?? 0,
          durationMs: w.endMs - w.startMs,
          spans: w.spans,
        };
        if (profile === 'baseline')
          return {
            ...checkLowCost(line, evidence, 'baseline'),
            insertionWarning: false,
            insertionState: 'unknown',
          };
        const result = assessCompleteness(
          line,
          evidence,
          profile === 'same-script' ? profile : 'script-fold',
        );
        return profile === 'insertion-gate-control'
          ? { ...result, reject: result.reject || result.insertionWarning }
          : result;
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
    const filtered = applyContentMask(
      candidates.hubertfa.cases,
      stats[profile],
    );
    const normal = filtered.filter((c) => c.variant === 'normal');
    const normalStats = stats[profile].filter((c) => c.variant === 'normal');
    const conditions = [
      'normal',
      'phrase-mismatch',
      'missing-audio',
      'missing-text',
    ].map((variant) => {
      const targets = items
        .map((item, i) => {
          if (item.variant !== variant) return null;
          let supported = true;
          try {
            lexicalUnits(
              candidates.hubertfa.cases[i].canonical.lines[item.targetIndex]
                .text,
              item.language,
            );
          } catch {
            supported = false;
          }
          return {
            id: item.id,
            supported,
            ready:
              filtered[i].estimate.preview.lines[item.targetIndex].status ===
              'ready',
            warning:
              stats[profile][i].decisions[item.targetIndex].insertionWarning,
          };
        })
        .filter(Boolean);
      return {
        variant,
        total: targets.length,
        supported: targets.filter((t) => t.supported).length,
        ready: targets.filter((t) => t.supported && t.ready).length,
        warnings: targets.filter((t) => t.supported && t.warning).length,
        unsupported: targets.filter((t) => !t.supported).length,
        details: targets,
      };
    });
    results[profile] = {
      normalLines: normal.reduce((n, c) => n + c.canonical.lines.length, 0),
      normalReady: normal.reduce(
        (n, c) =>
          n +
          c.estimate.preview.lines.filter((l) => l.status === 'ready').length,
        0,
      ),
      normalWarnings: normalStats
        .flatMap((c) => c.decisions)
        .filter((d) => d.insertionWarning).length,
      normalContentRejected: normalStats
        .flatMap((c) => c.decisions)
        .filter((d) => d.reject).length,
      timing: aggregateRows(
        scoreResults(items, filtered, refs)
          .filter((c) => c.variant === 'normal')
          .flatMap((c) => c.rows.map((r) => r.D)),
      ),
      conditions,
      stats: stats[profile],
    };
  }
  for (let i = 0; i < sourceFiles.length; i++)
    if ((await fileHash(sourceFiles[i])) !== sourceHashes[i])
      throw Error('completeness code changed');
  for (const [file, expected] of Object.entries(comparison.productionHashes))
    if ((await fileHash(file)) !== expected) throw Error('formal gate changed');
  if ((await fileHash(labelsFile)) !== labelsSha256)
    throw Error('human labels changed');
  const receipt = {
    date: '2026-10-19',
    kind: 'frozen ASR postprocess; warning is not human truth; no retiming or product sidecar',
    inputSha256: comparison.inputSha256,
    referenceSha256: comparison.referenceSha256,
    rawResultsSha256: comparison.rawResultsSha256,
    rawHashes,
    rules: completenessRules,
    results,
    humanLabelsSha256: labelsSha256,
    productionHashes: comparison.productionHashes,
    sourceHashes: Object.fromEntries(
      sourceFiles.map((f, i) => [
        path.relative(process.cwd(), f).split(path.sep).join('/'),
        sourceHashes[i],
      ]),
    ),
  };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(receipt, null, 2),
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results).map(([name, value]) => {
          const summary = { ...value };
          delete summary.stats;
          summary.conditions = value.conditions.map((value) => {
            const row = { ...value };
            delete row.details;
            return row;
          });
          return [name, summary];
        }),
      ),
    ),
  );
  return receipt;
}
if (require.main === module)
  run(...process.argv.slice(2)).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
module.exports = { loadFresh, run };
