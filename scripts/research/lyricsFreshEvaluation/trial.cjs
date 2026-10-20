'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const {
  fileHash,
  sha,
  bindCandidate,
} = require('../lyricsAlignmentCandidates/assets.cjs');
const { verifyAssets } = require('../lyricsAcoustic/assets.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const {
  runHfa: runEvaluation,
  runSmall: evaluate,
  validateTrialCases,
} = require('./trialJobs.cjs');
const {
  plannedWindows,
  readAsrWindow,
} = require('../lyricsAlignmentCandidates/qualityRun.cjs');
const {
  assertMatched,
  applyContentMask,
  aggregateRows,
} = require('./hubertComparison.cjs');
const { validateCandidate } = require('./review.cjs');
const { assessCompleteness } = require('./completeness.cjs');
const pins = require('./trial-assets.json');
const {
  downloadPinned,
} = require('../../../electron/lib/lyricsResearch/download');
async function download(root) {
  if (!path.isAbsolute(root) || fs.existsSync(root))
    throw Error('new absolute download directory required');
  fs.mkdirSync(root);
  const controller = new AbortController(),
    cancel = () => controller.abort();
  // Keep an application handler until cleanup finishes. signal-exit may resend
  // SIGINT immediately if a once-listener has already removed itself.
  process.on('SIGINT', cancel);
  try {
    for (const artifact of pins.artifacts) {
      if (path.basename(artifact.filename) !== artifact.filename)
        throw Error('research artifact name');
      console.log(
        JSON.stringify({
          downloading: artifact.filename,
          bytes: artifact.sizeBytes,
        }),
      );
      await downloadPinned(artifact, path.join(root, artifact.filename), {
        signal: controller.signal,
      });
    }
    fs.writeFileSync(
      path.join(root, 'downloads.json'),
      JSON.stringify(
        {
          researchOnly: true,
          status: 'downloads-verified-not-installed',
          pinsSha256: sha(
            fs.readFileSync(require.resolve('./trial-assets.json')),
          ),
          artifacts: pins.artifacts,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
async function runStages(stages, signal) {
  for (const stage of stages) {
    signal?.throwIfAborted();
    await stage();
    signal?.throwIfAborted();
  }
}
async function verify(hfaFile, smallFile) {
  const hfa = JSON.parse(fs.readFileSync(hfaFile)),
    config = JSON.parse(fs.readFileSync(smallFile)),
    manifest = JSON.parse(fs.readFileSync(config.manifest));
  const h = await verifyAssets(hfa),
    s = await bindCandidate('small', config.small, manifest.small);
  if (
    (await fileHash(config.small.modelPath)) !==
    pins.artifacts.find((a) => a.filename === 'ggml-small.bin').sha256
  )
    throw Error('trial requires pinned Whisper small weights');
  await h.assertCurrent();
  await s.assertCurrent();
  console.log(
    JSON.stringify({
      researchOnly: true,
      status: 'assets-verified-load-not-yet-tested',
      models: ['HubertFA', 'Whisper small'],
      qwenRequired: false,
      gateChanged: false,
    }),
  );
  return { h, s };
}
async function run(hfaFile, smallFile, casesFile, referencesFile, output) {
  if (!path.isAbsolute(output) || fs.existsSync(output))
    throw Error('new absolute trial output required');
  if (
    fs.statSync(casesFile).size > 2097152 ||
    (referencesFile !== '-' && fs.statSync(referencesFile).size > 2097152)
  )
    throw Error('trial input budget');
  const inputSha256 = sha(fs.readFileSync(casesFile)),
    referenceSha256 =
      referencesFile === '-' ? null : sha(fs.readFileSync(referencesFile));
  validateTrialCases(JSON.parse(fs.readFileSync(casesFile)));
  const expected = await verify(hfaFile, smallFile);
  fs.mkdirSync(output);
  const controller = new AbortController(),
    cancel = () => controller.abort();
  // Cancellation must retain signal ownership while owned workers are closing.
  process.on('SIGINT', cancel);
  const sourceFiles = [
      __filename,
      require.resolve('./trialJobs.cjs'),
      require.resolve('./review.cjs'),
      require.resolve('./hubertComparison.cjs'),
      require.resolve('../lyricsAcoustic/evaluate.cjs'),
      require.resolve('../lyricsAcoustic/job.cjs'),
      require.resolve('../lyricsAlignmentCandidates/job.cjs'),
      require.resolve('../lyricsAlignmentCandidates/qualityRun.cjs'),
      require.resolve('../lyricsAlignmentCandidates/tokenStartReplay.cjs'),
      require.resolve('opencc-js/t2cn'),
      require.resolve('wanakana'),
      require.resolve('../lyricsAcoustic/manifest.json'),
      path.resolve(JSON.parse(fs.readFileSync(smallFile)).manifest),
      path.resolve(hfaFile),
      path.resolve(smallFile),
      path.resolve(casesFile),
      ...(referencesFile === '-' ? [] : [path.resolve(referencesFile)]),
      require.resolve('./completeness.cjs'),
      require.resolve('./lowCost.cjs'),
      require.resolve('./content.cjs'),
      require.resolve('./trial-assets.json'),
    ],
    sourceHashes = await Promise.all(sourceFiles.map(fileHash));
  try {
    await runStages(
      [
        () =>
          runEvaluation({
            runtimeConfig: hfaFile,
            casesPath: casesFile,
            referencesPath: referencesFile === '-' ? null : referencesFile,
            outputRoot: path.join(output, 'hubertfa'),
            signal: controller.signal,
          }),
        () =>
          evaluate(
            smallFile,
            'small',
            casesFile,
            referencesFile,
            path.join(output, 'hubertfa'),
            path.join(output, 'small'),
            controller.signal,
          ),
        async () => {
          const items = JSON.parse(fs.readFileSync(casesFile)),
            h = JSON.parse(
              fs.readFileSync(path.join(output, 'hubertfa/results.json')),
            ),
            s = JSON.parse(
              fs.readFileSync(path.join(output, 'small/results.json')),
            ),
            config = JSON.parse(fs.readFileSync(smallFile));
          assertMatched(items, h, s);
          if (
            h.inputSha256 !== inputSha256 ||
            h.referenceSha256 !== referenceSha256 ||
            JSON.stringify(h.method) !== JSON.stringify(expected.h.method) ||
            JSON.stringify(s.method) !== JSON.stringify(expected.s.method)
          )
            throw Error('trial input or model changed from preflight');
          const stats = [];
          for (let i = 0; i < items.length; i++) {
            controller.signal.throwIfAborted();
            const item = items[i],
              hc = h.cases[i],
              sc = s.cases[i];
            const hs = await validateCandidate(
                path.join(output, 'hubertfa', item.id),
                item,
                hc,
              ),
              ss = await validateCandidate(
                path.join(output, 'small', item.id),
                item,
                sc,
              );
            if (hs.audio.sha256 !== ss.audio.sha256)
              throw Error('trial paired audio');
            const planned = plannedWindows(item, hc.canonical);
            const windows = planned.map((w) =>
              sc.metrics.windows.find((r) => r.index === w.index)?.raw
                ? {
                    ...w,
                    ...readAsrWindow(
                      config.small,
                      'small',
                      { method: s.method, metrics: sc.metrics },
                      s.method,
                      planned,
                      w,
                      item.language,
                      w.endMs - w.startMs,
                    ),
                  }
                : { ...w, missing: true },
            );
            const decisions = hc.canonical.lines.map((line) => {
              const w = windows.find((w) => w.lineIds.includes(line.lineId));
              return w && !w.missing
                ? assessCompleteness(line, {
                    language: item.language,
                    windowStartMs: w.startMs,
                    offsetMs: item.offsetMs ?? 0,
                    durationMs: w.endMs - w.startMs,
                    spans: w.spans,
                  })
                : {
                    reject: false,
                    insertionWarning: false,
                    insertionState: 'unknown',
                    missing: true,
                  };
            });
            stats.push({ id: item.id, decisions });
          }
          const filtered = applyContentMask(h.cases, stats),
            refs =
              referencesFile === '-'
                ? {}
                : JSON.parse(fs.readFileSync(referencesFile));
          const timing = aggregateRows(
            scoreResults(items, filtered, refs).flatMap((c) =>
              c.rows.map((r) => r.D),
            ),
          );
          for (let i = 0; i < sourceFiles.length; i++)
            if ((await fileHash(sourceFiles[i])) !== sourceHashes[i])
              throw Error('trial code changed');
          controller.signal.throwIfAborted();
          const result = {
            researchOnly: true,
            status: 'complete',
            note: 'Independent preview only. Canonical T1/T2 and product gates unchanged; insertion warnings do not retime or reject.',
            inputSha256: h.inputSha256,
            referenceSha256: h.referenceSha256,
            models: { hubertfa: h.method, small: s.method },
            timing,
            stats,
            previews: filtered.map((c) => ({
              id: c.id,
              canonical: c.canonical,
              preview: c.estimate.preview,
            })),
            sourceHashes: Object.fromEntries(
              sourceFiles.map((f, i) => [
                path.relative(process.cwd(), f).split(path.sep).join('/'),
                sourceHashes[i],
              ]),
            ),
          };
          fs.writeFileSync(
            path.join(output, 'preview.json'),
            JSON.stringify(result, null, 2),
            { flag: 'wx' },
          );
          console.log(
            JSON.stringify({
              researchOnly: true,
              completed: items.length,
              timing,
            }),
          );
        },
      ],
      controller.signal,
    );
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  (command === 'download'
    ? download(...args)
    : command === 'verify'
      ? verify(...args)
      : command === 'run'
        ? run(...args)
        : Promise.reject(Error('download, verify or run required'))
  ).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
module.exports = { downloadPinned, download, runStages, verify, run };
