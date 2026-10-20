'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { fileHash, sha } = require('../lyricsAlignmentCandidates/assets.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { textCuts, lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
const {
  validateCandidate,
  validateKey,
  validateLabels,
  summarizeHuman,
} = require('./review.cjs');
function assertMatched(items, a, b) {
  if (
    a.inputSha256 !== b.inputSha256 ||
    a.referenceSha256 !== b.referenceSha256 ||
    items.length !== a.cases.length ||
    items.length !== b.cases.length ||
    new Set(items.map((i) => i.id)).size !== items.length ||
    items.some(
      (item, i) =>
        item.id !== a.cases[i].id ||
        item.id !== b.cases[i].id ||
        JSON.stringify(a.cases[i].canonical) !==
          JSON.stringify(b.cases[i].canonical),
    )
  )
    throw Error('matched comparison identity');
}
function aggregateRows(rows) {
  const errors = rows.flatMap((r) => r.errorsMs).sort((a, b) => a - b),
    scorable = rows.reduce((n, r) => n + r.scorable, 0);
  return {
    requested: rows.reduce((n, r) => n + r.requested, 0),
    scorable,
    measured: errors.length,
    missing: scorable - errors.length,
    within100: errors.filter((e) => e <= 100).length,
    onset100: scorable
      ? errors.filter((e) => e <= 100).length / scorable
      : null,
    over500: errors.filter((e) => e > 500).length,
    over1000: errors.filter((e) => e > 1000).length,
    medianMs: errors.length ? errors[Math.floor(errors.length / 2)] : null,
    p90Ms: errors.length ? errors[Math.ceil(errors.length * 0.9) - 1] : null,
  };
}
function applyContentMask(cases, stats) {
  if (
    cases.length !== stats.length ||
    cases.some(
      (c, i) =>
        c.id !== stats[i].id ||
        stats[i].decisions.length !== c.canonical.lines.length ||
        stats[i].decisions.some((d) => typeof d.reject !== 'boolean'),
    )
  )
    throw Error('content mask identity');
  return cases.map((c, i) => ({
    ...c,
    estimate: {
      ...c.estimate,
      preview: {
        ...c.estimate.preview,
        lines: c.estimate.preview.lines.map((l, j) =>
          stats[i].decisions[j].reject
            ? {
                ...l,
                status: 'unsupported',
                reason: 'missing-boundaries',
                chunks: [],
              }
            : l,
        ),
      },
    },
  }));
}
const read = (f) => {
  if (fs.statSync(f).size > 16777216) throw Error('comparison byte budget');
  return fs.readFileSync(f);
};
async function compare(root, lowcostFile, output) {
  if (
    !path.isAbsolute(root) ||
    !path.isAbsolute(output) ||
    fs.existsSync(output)
  )
    throw Error('new absolute comparison output');
  const ib = read(path.join(root, 'cases.json')),
    rb = read(path.join(root, 'references.json')),
    items = JSON.parse(ib),
    refs = JSON.parse(rb),
    qb = read(path.join(root, 'qwen/results.json')),
    hb = read(path.join(root, 'hubertfa/results.json')),
    sb = read(path.join(root, 'small/results.json')),
    q = JSON.parse(qb),
    h = JSON.parse(hb),
    s = JSON.parse(sb),
    maskBytes = read(lowcostFile),
    mask = JSON.parse(maskBytes);
  const previous = JSON.parse(
    read(
      'docs/research/lyrics-alignment/data/lyrics-root-causes-2026-10-19.json',
    ),
  );
  if (
    q.inputSha256 !== sha(ib) ||
    q.referenceSha256 !== sha(rb) ||
    h.method.id !== 'hubertfa-research' ||
    h.method.kind !== 'model' ||
    q.method.id !== 'qwen-candidate-research' ||
    s.method.id !== 'small-candidate-research' ||
    sha(maskBytes) !== previous.rawReplaySha256 ||
    mask.fresh.inputSha256 !== sha(ib) ||
    mask.fresh.referenceSha256 !== sha(rb) ||
    mask.fresh.qwenResultsSha256 !== sha(qb) ||
    mask.fresh.smallResultsSha256 !== sha(sb)
  )
    throw Error('comparison frozen identity');
  assertMatched(items, q, h);
  assertMatched(items, q, s);
  const ownFiles = [
      __filename,
      require.resolve('./review.cjs'),
      require.resolve('../lyricsAcoustic/evaluate.cjs'),
      require.resolve('../lyricsAcoustic/protocol.cjs'),
    ],
    ownHashes = await Promise.all(ownFiles.map(fileHash));
  for (let i = 0; i < items.length; i++) {
    const sides = [];
    for (const [name, result] of [
      ['qwen', q],
      ['hubertfa', h],
      ['small', s],
    ]) {
      const side = await validateCandidate(
        path.join(root, name, items[i].id),
        items[i],
        result.cases[i],
      );
      if (JSON.stringify(side.method) !== JSON.stringify(result.method))
        throw Error('comparison sidecar method');
      sides.push(side);
    }
    if (sides.some((side) => side.audio.sha256 !== sides[0].audio.sha256))
      throw Error('comparison paired audio');
  }
  const filteredQ = applyContentMask(
      q.cases,
      mask.fresh.results['script-fold'].stats,
    ),
    filteredH = applyContentMask(
      h.cases,
      mask.fresh.results['script-fold'].stats,
    );
  const candidates = {
      qwen: q.cases,
      hubertfa: h.cases,
      'qwen-small-fold': filteredQ,
      'hubertfa-small-fold': filteredH,
    },
    results = {};
  for (const [name, cases] of Object.entries(candidates)) {
    const scored = scoreResults(items, cases, refs),
      normal = scored.filter((c) => c.variant === 'normal');
    results[name] = {
      timing: aggregateRows(normal.flatMap((c) => c.rows.map((r) => r.D))),
      normalReadyLines: normal.reduce((n, c) => n + c.readyLines, 0),
      normalTotalLines: normal.reduce((n, c) => n + c.totalLines, 0),
      perNormal: normal.map((c) => ({
        id: c.id,
        language: c.language,
        score: c.D,
        rows: c.rows.map((r, i) => ({
          lineIndex: i,
          lineId: r.lineId,
          score: r.D,
        })),
      })),
      conditions: [
        'normal',
        'phrase-mismatch',
        'missing-text',
        'missing-audio',
      ].map((variant) => {
        const group = items
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.variant === variant);
        const details = group.map(({ c, i }) => {
          let supported = true;
          try {
            lexicalUnits(
              cases[i].canonical.lines[c.targetIndex].text,
              c.language,
            );
          } catch {
            supported = false;
          }
          return {
            id: c.id,
            supported,
            ready:
              cases[i].estimate.preview.lines[c.targetIndex].status === 'ready',
            reason: cases[i].estimate.preview.lines[c.targetIndex].reason,
          };
        });
        return {
          variant,
          cases: group.length,
          supportedTargets: details.filter((d) => d.supported).length,
          readyTargets: details.filter((d) => d.ready).length,
          details,
        };
      }),
    };
  }
  const baseline = aggregateRows(
    scoreResults(items, q.cases, refs)
      .filter((c) => c.variant === 'normal')
      .flatMap((c) => c.rows.map((r) => r.A)),
  );
  const manifestBytes = read(path.join(root, 'human-review/manifest.json')),
    pm = JSON.parse(manifestBytes),
    key = JSON.parse(read(path.join(root, 'review-key.json'))),
    labels = JSON.parse(read(path.join(root, 'human-review/labels.json')));
  if (
    sha(manifestBytes) !== key.manifestSha256 ||
    pm.corpusSha256 !== sha(ib) ||
    pm.resultSha256.qwen !== sha(qb) ||
    pm.resultSha256.small !==
      (await fileHash(path.join(root, 'qwen-small/results.json')))
  )
    throw Error('comparison human packet');
  validateKey(pm, key);
  const human = summarizeHuman(validateLabels(labels, pm));
  for (const sample of pm.samples)
    if (
      !/^audio\/r-\d{3}\.wav$/.test(sample.audio) ||
      (await fileHash(path.join(root, 'human-review', sample.audio))) !==
        sample.audioSha256
    )
      throw Error('comparison human audio');
  const originalPriority = mask.priority;
  const silencePriority = items
    .filter(
      (c) =>
        (c.variant === 'missing-audio' && c.language === 'zh') ||
        c.id === 'ja-2-missing-audio',
    )
    .map((c) => {
      const k = key.rows.find(
          (r) => r.caseId === c.id && r.lineIndex === c.targetIndex,
        ),
        sample = pm.samples.find((s) => s.sampleId === k.sampleId);
      return {
        sampleId: k.sampleId,
        caseId: c.id,
        lineIndex: c.targetIndex,
        priority: 'P0',
        reason: 'HubertFA produced chunks during exact constructed silence',
        startMs: sample.startMs,
        endMs: sample.endMs,
        audioSha256: sample.audioSha256,
        reviewed: false,
      };
    });
  const priority = [...silencePriority, ...originalPriority];
  const localLicense = JSON.parse(
      read(path.join(root, 'hubertfa/license-local.json')),
    ),
    pin = require('../lyricsAcoustic/manifest.json');
  if (
    localLicense.modelSha256 !== pin.model['model.onnx'].sha256 ||
    localLicense.archiveSha256 !==
      '48bd6dbcc293e47cc6cbcc556baf575e3d91d61d0ac88ddeccd6098f8f346fa2'
  )
    throw Error('comparison licensed artifact identity');
  const productionHashes = {};
  for (const [file, hash] of Object.entries(previous.sourceHashes)) {
    if ((await fileHash(file)) !== hash) throw Error('production gate changed');
    productionHashes[file] = hash;
  }
  for (let i = 0; i < ownFiles.length; i++)
    if ((await fileHash(ownFiles[i])) !== ownHashes[i])
      throw Error('comparison code changed');
  fs.mkdirSync(path.join(output, 'proposals'), { recursive: true });
  for (const p of priority) {
    const sample = pm.samples.find((s) => s.sampleId === p.sampleId),
      caseIndex = items.findIndex((c) => c.id === p.caseId),
      line = q.cases[caseIndex].canonical.lines[p.lineIndex];
    if (
      sample.text !== line.text ||
      JSON.stringify(sample.cuts) !==
        JSON.stringify(
          textCuts(line.text, items[caseIndex].language).filter(
            (c) => c > 0 && c < line.text.length,
          ),
        )
    )
      throw Error('comparison priority line');
    for (const [name, cases] of Object.entries(candidates)) {
      const chunks =
        cases[caseIndex].estimate.preview.lines[p.lineIndex].chunks;
      fs.writeFileSync(
        path.join(output, 'proposals', `${p.sampleId}-${name}.txt`),
        chunks
          .map(
            (c, i) =>
              `${(c.startMs / 1000).toFixed(3)}\t${((chunks[i + 1]?.startMs ?? line.endMs) / 1000).toFixed(3)}\t${line.text.slice(c.from, c.to).replace(/[\r\n\t]/gu, ' ')}`,
          )
          .join('\n'),
      );
    }
  }
  const receipt = {
    date: '2026-10-19',
    scope:
      'same fresh corpus; frozen methods; provider timing and constructed output proxies; no human accuracy claim',
    inputSha256: sha(ib),
    referenceSha256: sha(rb),
    rawResultsSha256: { qwen: sha(qb), hubertfa: sha(hb), small: sha(sb) },
    contentMaskSha256: sha(maskBytes),
    contentCounterfactual:
      'frozen script-fold decisions applied to both methods, no retiming or product sidecars',
    models: { hubertfa: h.method, qwen: q.method, small: s.method },
    baseline,
    results,
    human,
    priority,
    humanManifestSha256: sha(manifestBytes),
    hubertfaVerification: JSON.parse(
      read(path.join(root, 'hubertfa/verification.json')),
    ),
    licenseLocal: localLicense,
    productionHashes,
    productionBoundariesUnchanged: Object.keys(productionHashes).length,
    sourceHashes: Object.fromEntries(
      ownFiles.map((f, i) => [
        path.relative(process.cwd(), f).split(path.sep).join('/'),
        ownHashes[i],
      ]),
    ),
    limitations: [
      '35 timing references are Japanese external provider internal cuts, not manually verified ground truth; Chinese has none',
      'Four songs; paired constructed variants are not independent recordings or natural live/cover versions',
      'First JA target is policy-unsupported English; only three supported target groups',
      'Two full recipes differ in sample rate, frontend/G2P, and decoder constraints; no isolated network-only causal claim',
      'Counterfactual content rescue can restore bad timings elsewhere; stress completeness not established',
      'Root Apache-2.0 license and download instructions do not by themselves settle the exact release weight/dictionary scope',
    ],
  };
  fs.writeFileSync(
    path.join(output, 'comparison.json'),
    JSON.stringify(receipt, null, 2),
  );
  fs.writeFileSync(
    path.join(output, 'PRIORITY.md'),
    `# HubertFA優先聽查\n\n${priority.length}列，前三列是原音訊被整句精確靜音後HubertFA仍給詞塊；另保留前輪12列時間／內容控制。參照原human-review/labels.json獨立填起音與內容，不改原A/B，不代簽人審。這是風險定向抽查，並非隨機盲測。先聽，再匯入proposals內明確標方法的TSV；空檔為回退。\n\n${priority.map((p) => `- ${p.priority} ${p.sampleId}：[音訊](../human-review/audio/${p.sampleId}.wav)，${p.startMs}–${p.endMs}ms；${p.reason}。`).join('\n')}\n`,
  );
  console.log(
    JSON.stringify({
      baseline,
      results: Object.fromEntries(
        Object.entries(results).map(([name, r]) => [
          name,
          {
            timing: r.timing,
            normalReady: r.normalReadyLines,
            conditions: r.conditions.map(({ details, ...c }) => ({
              ...c,
              detailCount: details.length,
            })),
          },
        ]),
      ),
      priority: priority.length,
      human,
      production: receipt.productionBoundariesUnchanged,
    }),
  );
}
if (require.main === module)
  compare(...process.argv.slice(2)).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
module.exports = { assertMatched, aggregateRows, applyContentMask, compare };
