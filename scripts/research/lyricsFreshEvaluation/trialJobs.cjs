'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { verifyAssets } = require('../lyricsAcoustic/assets.cjs');
const {
  bindCandidate,
  sha,
} = require('../lyricsAlignmentCandidates/assets.cjs');
const { startResearchJob } = require('../lyricsAcoustic/job.cjs');
const { startCandidateJob } = require('../lyricsAlignmentCandidates/job.cjs');
const {
  outerVtt,
  researchSource,
  scoreResults,
} = require('../lyricsAcoustic/evaluate.cjs');
const {
  prepareAcousticEstimateContext,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
function validateTrialCases(items) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 100 ||
    new Set(items.map((i) => i.id)).size !== items.length ||
    items.some(
      (i) =>
        !/^[a-z0-9][a-z0-9-]{0,100}$/i.test(i.id) ||
        !path.isAbsolute(i.audio) ||
        path.extname(i.audio).toLowerCase() !== '.wav' ||
        (i.filename ?? 'main.vtt') !== 'main.vtt' ||
        !['zh', 'ja'].includes(i.language) ||
        !Number.isSafeInteger(i.durationMs) ||
        i.durationMs <= 0,
    )
  )
    throw Error(
      'trial v1 requires unique cases, absolute WAV, main.vtt, zh/ja and positive duration',
    );
}
async function runOwnedJob(start, signal) {
  signal?.throwIfAborted();
  const job = start(),
    cancel = () => {
      void job.cancel().catch(() => {});
    };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    const result = await job.result;
    signal?.throwIfAborted();
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (signal?.aborted) await job.cancel();
  }
}
function save(root, method, inputSha256, referenceSha256, cases, items, refs) {
  const value = { method, inputSha256, referenceSha256, cases };
  fs.writeFileSync(
    path.join(root, 'results.json'),
    JSON.stringify(value, null, 2),
  );
  fs.writeFileSync(
    path.join(root, 'summary.json'),
    JSON.stringify(
      {
        method,
        inputSha256,
        referenceSha256,
        cases: scoreResults(items, cases, refs),
      },
      null,
      2,
    ),
  );
}
async function runHfa({
  runtimeConfig,
  casesPath,
  referencesPath,
  outputRoot,
  signal,
}) {
  const bytes = fs.readFileSync(casesPath),
    items = JSON.parse(bytes),
    referenceBytes = referencesPath ? fs.readFileSync(referencesPath) : null;
  validateTrialCases(items);
  const binding = await verifyAssets(
    JSON.parse(fs.readFileSync(runtimeConfig)),
  );
  signal?.throwIfAborted();
  const { createServer } = require('vite');
  const server = await createServer({
    configFile: false,
    root: path.resolve(__dirname, '../../..'),
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  let normalize;
  try {
    ({ normalizeLyricsDocument: normalize } = await server.ssrLoadModule(
      '/src/utils/lyricsDocument.js',
    ));
  } finally {
    await server.close();
  }
  signal?.throwIfAborted();
  fs.mkdirSync(outputRoot);
  const cases = [];
  for (const item of items) {
    signal?.throwIfAborted();
    const trackDir = path.join(outputRoot, item.id);
    fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
    fs.copyFileSync(item.audio, path.join(trackDir, 'audio.wav'));
    const text = item.lyricsText ?? outerVtt(item.lines);
    fs.writeFileSync(path.join(trackDir, 'lyrics/main.vtt'), text);
    const source = researchSource('main.vtt', item.offsetMs ?? 0),
      context = await prepareAcousticEstimateContext(trackDir, source, {
        method: binding.method,
      });
    signal?.throwIfAborted();
    const original = normalize({
        text,
        source,
        sourceFingerprint: context.source.sha256,
      }),
      canonical = structuredClone(original);
    for (const line of canonical.lines) delete line.segments;
    canonical.granularity = 'T1';
    if (
      item.lines &&
      (canonical.lines.length !== item.lines.length ||
        canonical.lines.some((l, i) => l.text !== item.lines[i].text))
    )
      throw Error('trial normalization mismatch');
    const result = await runOwnedJob(
      () =>
        startResearchJob({
          binding,
          trackDir,
          source,
          canonical,
          language: item.language,
          durationMs: item.durationMs,
          jobsRoot: path.join(outputRoot, 'jobs'),
          isCurrent: () => !signal?.aborted,
          onProgress: (event) =>
            console.log(
              JSON.stringify({
                caseId: item.id,
                model: 'hubertfa',
                stage: event.stage,
              }),
            ),
        }),
      signal,
    );
    cases.push({
      id: item.id,
      songId: item.songId,
      language: item.language,
      tier: item.tier,
      phase: item.phase,
      variant: item.variant,
      t1Kind: item.t1Kind,
      referenceKind: item.referenceKind,
      canonical,
      original,
      ...result,
    });
    console.log(
      JSON.stringify({ caseId: item.id, stage: 'hubertfa-complete' }),
    );
  }
  signal?.throwIfAborted();
  save(
    outputRoot,
    binding.method,
    sha(bytes),
    referenceBytes ? sha(referenceBytes) : null,
    cases,
    items,
    referenceBytes ? JSON.parse(referenceBytes) : {},
  );
}
async function runSmall(
  configFile,
  _kind,
  casesFile,
  referencesFile,
  baselineRoot,
  outputRoot,
  signal,
) {
  const bytes = fs.readFileSync(casesFile),
    items = JSON.parse(bytes),
    config = JSON.parse(fs.readFileSync(configFile)),
    manifest = JSON.parse(fs.readFileSync(config.manifest));
  validateTrialCases(items);
  const binding = await bindCandidate('small', config.small, manifest.small);
  signal?.throwIfAborted();
  const baseline = JSON.parse(
      fs.readFileSync(path.join(baselineRoot, 'results.json')),
    ),
    rb = referencesFile === '-' ? null : fs.readFileSync(referencesFile);
  if (
    baseline.inputSha256 !== sha(bytes) ||
    baseline.referenceSha256 !== (rb ? sha(rb) : null)
  )
    throw Error('trial frozen input changed');
  fs.mkdirSync(outputRoot);
  const cases = [];
  for (let i = 0; i < items.length; i++) {
    signal?.throwIfAborted();
    const item = items[i],
      old = baseline.cases[i],
      trackDir = path.join(outputRoot, item.id);
    fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
    fs.copyFileSync(
      path.join(baselineRoot, item.id, 'audio.wav'),
      path.join(trackDir, 'audio.wav'),
    );
    fs.copyFileSync(
      path.join(baselineRoot, item.id, 'lyrics/main.vtt'),
      path.join(trackDir, 'lyrics/main.vtt'),
    );
    const result = await runOwnedJob(
      () =>
        startCandidateJob({
          binding,
          trackDir,
          source: researchSource('main.vtt', item.offsetMs ?? 0),
          canonical: old.canonical,
          language: item.language,
          durationMs: item.durationMs,
          jobsRoot: path.join(outputRoot, 'jobs'),
          isCurrent: () => !signal?.aborted,
        }),
      signal,
    );
    cases.push({ ...old, estimate: result.estimate, metrics: result.metrics });
    console.log(JSON.stringify({ caseId: item.id, stage: 'small-complete' }));
  }
  signal?.throwIfAborted();
  save(
    outputRoot,
    binding.method,
    sha(bytes),
    rb ? sha(rb) : null,
    cases,
    items,
    rb ? JSON.parse(rb) : {},
  );
}
module.exports = { validateTrialCases, runOwnedJob, runHfa, runSmall };
