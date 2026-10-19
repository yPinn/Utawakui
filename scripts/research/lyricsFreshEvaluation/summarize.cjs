'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { sha, fileHash } = require('../lyricsAlignmentCandidates/assets.cjs');
const { lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
async function summarize(root, outputFile) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file)));
  const input = read('cases.json'),
    q = read('qwen/results.json'),
    s = read('qwen-small/results.json'),
    qs = read('qwen/summary.json'),
    ss = read('qwen-small/summary.json'),
    small = read('small/results.json'),
    selection = read('selection.json');
  const variants = [
    'normal',
    'phrase-mismatch',
    'missing-text',
    'missing-audio',
  ];
  const conditions = variants.map((variant) => {
    const indices = input
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.variant === variant);
    return {
      variant,
      cases: indices.length,
      supportedTargetGroups: indices.filter(({ c, i }) => {
        try {
          lexicalUnits(
            q.cases[i].canonical.lines[c.targetIndex].text,
            c.language,
          );
          return true;
        } catch {
          return false;
        }
      }).length,
      qwenTargetReady: indices.filter(
        ({ c, i }) =>
          q.cases[i].estimate.preview.lines[c.targetIndex].status === 'ready',
      ).length,
      smallCheckedTargetReady: indices.filter(
        ({ c, i }) =>
          s.cases[i].estimate.preview.lines[c.targetIndex].status === 'ready',
      ).length,
      smallTargetRejected: indices.filter(
        ({ c, i }) => s.cases[i].metrics.content[c.targetIndex].reject,
      ).length,
      extraContentWarnings: indices.filter(
        ({ c, i }) =>
          s.cases[i].metrics.content[c.targetIndex].extraContentWarning,
      ).length,
      details: indices.map(({ c, i }) => ({
        songId: c.songId,
        qwenReady:
          q.cases[i].estimate.preview.lines[c.targetIndex].status === 'ready',
        checkedReady:
          s.cases[i].estimate.preview.lines[c.targetIndex].status === 'ready',
        ...s.cases[i].metrics.content[c.targetIndex],
      })),
    };
  });
  const aggregate = (summary, predicate, field = 'D') => {
    const cases = summary.cases.filter((c) =>
        predicate(input.find((i) => i.id === c.id)),
      ),
      scorable = cases.reduce((n, c) => n + c[field].scorable, 0),
      errors = cases
        .flatMap((c) => c.rows.flatMap((r) => r[field].errorsMs))
        .sort((a, b) => a - b);
    return {
      cases: cases.length,
      requested: cases.reduce((n, c) => n + c[field].requested, 0),
      scorable,
      measured: errors.length,
      missing: scorable - errors.length,
      within100: errors.filter((e) => e <= 100).length,
      over500: errors.filter((e) => e > 500).length,
      over1000: errors.filter((e) => e > 1000).length,
      medianMs: errors.length ? errors[Math.floor(errors.length / 2)] : null,
      p90Ms: errors.length ? errors[Math.ceil(errors.length * 0.9) - 1] : null,
    };
  };
  const normalIndices = input
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.variant === 'normal');
  const timing = (rows) => ({
    totalSeconds: rows.reduce((n, c) => n + c.metrics.seconds, 0),
    medianCaseSeconds: rows.map((c) => c.metrics.seconds).sort((a, b) => a - b)[
      Math.floor(rows.length / 2)
    ],
    peakRssBytes:
      Math.max(...rows.map((c) => c.metrics.peakRssBytes ?? 0)) || null,
    ownedWorkersClosed: rows.every(
      (c) => c.metrics.remainingOwnedPids.length === 0,
    ),
  });
  const previous = JSON.parse(
      fs.readFileSync('docs/research/data/lyrics-qwen-quality-2026-10-19.json'),
    ),
    sourceHashes = {};
  for (const [file, before] of Object.entries(previous.sourceHashes)) {
    const actual = await fileHash(file);
    if (actual !== before) throw Error(`production boundary changed: ${file}`);
    sourceHashes[file] = actual;
  }
  const researchSourceHashes = {};
  for (const file of fs
    .readdirSync(__dirname)
    .filter((n) => /\.(?:cjs|mjs)$/.test(n))
    .sort())
    researchSourceHashes[file] = await fileHash(path.join(__dirname, file));
  const humanReceipt = read('human-pending-receipt-v2.json');
  const receipt = {
    date: '2026-10-19',
    scope:
      'private controlled corpus; no formal model gate or default-download changes',
    inputSha256: sha(fs.readFileSync(path.join(root, 'cases.json'))),
    referenceSha256: sha(fs.readFileSync(path.join(root, 'references.json'))),
    resultSha256: {
      qwen: sha(fs.readFileSync(path.join(root, 'qwen/results.json'))),
      smallChecked: sha(
        fs.readFileSync(path.join(root, 'qwen-small/results.json')),
      ),
    },
    methods: { qwen: q.method, small: small.method, qwenSmall: s.method },
    researchSourceHashes,
    humanAudit: {
      ...humanReceipt.human,
      pending: humanReceipt.human.total - humanReceipt.human.reviewed,
      manifestSha256: humanReceipt.manifestSha256,
      receiptSha256: sha(
        fs.readFileSync(path.join(root, 'human-pending-receipt-v2.json')),
      ),
    },
    corpus: {
      independentSongs: selection.cases.length,
      byLanguage: {
        zh: selection.cases.filter((c) => c.songId.startsWith('zh')).length,
        ja: selection.cases.filter((c) => c.songId.startsWith('ja')).length,
      },
      cases: input.length,
      selection: selection.strategy,
      variantNote:
        'phrase-mismatch is synthetic donor-phrase substitution, not a natural alternate version; missing-audio is exact whole-phrase silence, not isolated vocal removal; missing-text retains valid surviving words',
      humanReviewed: 0,
      humanOnsets: 0,
    },
    conditions,
    normalOutput: {
      qwenReadyLines: normalIndices.reduce(
        (n, { i }) =>
          n +
          q.cases[i].estimate.preview.lines.filter((l) => l.status === 'ready')
            .length,
        0,
      ),
      checkedReadyLines: normalIndices.reduce(
        (n, { i }) =>
          n +
          s.cases[i].estimate.preview.lines.filter((l) => l.status === 'ready')
            .length,
        0,
      ),
      totalLines: normalIndices.reduce(
        (n, { i }) => n + q.cases[i].canonical.lines.length,
        0,
      ),
    },
    externalProviderAgreement: {
      note: 'not human accuracy; fine provider references only for new Japanese; normal clips only to avoid counting manipulated duplicates; internal cuts only, excluding T1 first anchors',
      qwen: aggregate(qs, (c) => c.variant === 'normal'),
      coarseBaseline: aggregate(qs, (c) => c.variant === 'normal', 'A'),
      checked: aggregate(ss, (c) => c.variant === 'normal'),
    },
    timing: {
      qwen: timing(q.cases),
      small: timing(small.cases),
      note: 'cold model per case, CPU serial; summing case times describes this research harness, not warm full-song latency',
    },
    capacity: {
      unit: 'decimal bytes; logical installed payload; excludes app/OS/music/results/UV/job caches; includes current Python caches',
      qwenOwnedBytes: 2902670349,
      smallIncrementBytes: 508450607,
      qwenSmallOwnedBytes: 3411120956,
      ffmpegBytes: 222248960,
      qwenSmallIncludingFfmpegBytes: 3633369916,
      installationPeakBytes: null,
      lowRamAcceptance: false,
      gpuAcceptance: false,
    },
    sourceHashes,
    productionBoundaryUnchanged: Object.keys(sourceHashes).length,
    limitations: [
      '4 songs are not representative population; paired variants are not independent samples',
      'New Chinese clips have no external fine references; no timing accuracy claim',
      'External provider timing and construction proxies do not establish human false-accept or false-reject rates',
      'True live/cover alternate versions and overlapping vocals remain untested in this new corpus',
      'Unknown/missing ASR passes through original Qwen research estimates; content checker is not a guarantee of safety or accuracy',
    ],
  };
  fs.writeFileSync(outputFile, JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      conditions: conditions.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(([key]) => key !== 'details'),
        ),
      ),
      normalOutput: receipt.normalOutput,
      providerAgreement: receipt.externalProviderAgreement,
      timing: receipt.timing,
    }),
  );
}
if (require.main === module)
  summarize(...process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { summarize };
