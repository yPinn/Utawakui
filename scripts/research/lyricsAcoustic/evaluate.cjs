'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyAssets } = require('./assets.cjs');
const { startResearchJob } = require('./job.cjs');
const { textCuts, scoreCuts } = require('./protocol.cjs');
const {
  createHeavyJobScheduler,
} = require('../../../electron/lib/audioProcessing/heavyJobScheduler');
const {
  prepareAcousticEstimateContext,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const {
  presentationLineSegments,
} = require('../../../shared/presentation/state.mjs');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const researchSource = (filename, offsetMs = 0) => ({
  filename,
  offsetMs,
  kind: 'manual',
});

function providerReferenceRows(item, original) {
  return Object.fromEntries(
    original.lines.map((line, index) => {
      let from = 0;
      return [
        item.lines?.[index]?.lineId ?? line.lineId,
        (line.segments ?? []).map((segment) => {
          const entry = { from, startMs: segment.startMs };
          from += segment.text.length;
          return entry;
        }),
      ];
    }),
  );
}

function readJson(file, limit = 2097152) {
  if (fs.statSync(file).size > limit)
    throw new Error('research manifest byte limit');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function timestamp(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('research VTT time');
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
function outerVtt(lines) {
  return `WEBVTT\n\n${lines.map((line) => `${timestamp(line.startMs)} --> ${timestamp(line.endMs)}\n${line.text}\n`).join('\n')}`;
}
function summarize(rows) {
  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const errors = rows.flatMap((r) => r.errorsMs).sort((a, b) => a - b);
  const scorable = sum('scorable'),
    within100 = sum('within100');
  return {
    requested: sum('requested'),
    scorable,
    noReference: sum('noReference'),
    retained: sum('retained'),
    measured: errors.length,
    onset100: scorable ? within100 / scorable : null,
    coverage: scorable ? errors.length / scorable : null,
    medianMs: errors.length ? errors[Math.floor(errors.length / 2)] : null,
    p90Ms: errors.length
      ? errors[Math.min(errors.length - 1, Math.ceil(errors.length * 0.9) - 1)]
      : null,
  };
}

function scoreCase(item, canonical, estimate, referenceRows) {
  const rows = canonical.lines.map((line, index) => {
    const key = item.lines?.[index]?.lineId ?? line.lineId;
    const refs = new Map(
      (referenceRows[key] ?? []).map((r) => [r.from, r.startMs]),
    );
    const cuts = textCuts(line.text, item.language);
    const baseline = presentationLineSegments(
      {
        lyrics: { synced: true, offsetMs: item.offsetMs ?? 0 },
        playback: { durationMs: item.durationMs },
      },
      canonical.lines,
      index,
    );
    const starts = new Map();
    let from = line.text.length - line.text.trimStart().length;
    for (const segment of baseline?.segments ?? []) {
      starts.set(from, segment.startMs);
      from += segment.text.length;
    }
    const model = new Map(
      estimate?.preview?.lines[index]?.chunks.map((c) => [c.from, c.startMs]) ??
        [],
    );
    return {
      lineId: key,
      A: scoreCuts(cuts, refs, starts),
      D: scoreCuts(cuts, refs, model),
    };
  });
  return {
    rows,
    A: summarize(rows.map((r) => r.A)),
    D: summarize(rows.map((r) => r.D)),
  };
}

function scoreResults(items, results, references) {
  if (
    items.length !== results.length ||
    items.some((item, i) => item.id !== results[i].id)
  )
    throw new Error('research scoring case identity');
  return results.map((result, index) => {
    const item = items[index];
    const refs =
      item.referenceKind === 'provider-canonical'
        ? providerReferenceRows(item, result.original)
        : (references[result.id] ?? {});
    return {
      id: result.id,
      songId: result.songId,
      language: result.language,
      tier: result.tier,
      phase: result.phase,
      variant: result.variant,
      t1Kind: result.t1Kind,
      referenceKind: result.referenceKind,
      ...scoreCase(item, result.canonical, result.estimate, refs),
      metrics: result.metrics,
      readyLines: result.estimate.preview.lines.filter(
        (line) => line.status === 'ready',
      ).length,
      totalLines: result.canonical.lines.length,
    };
  });
}

async function runEvaluation({
  runtimeConfig,
  casesPath,
  referencesPath,
  outputRoot,
}) {
  if (!path.isAbsolute(outputRoot) || fs.existsSync(outputRoot))
    throw new Error('research output must be a new absolute directory');
  const items = readJson(casesPath);
  if (!Array.isArray(items) || !items.length || items.length > 100)
    throw new Error('research case count');
  const binding = await verifyAssets(readJson(runtimeConfig, 65536));
  const evaluationSha256 = hash(fs.readFileSync(__filename));
  const inputSha256 = hash(fs.readFileSync(casesPath)),
    referenceSha256 = referencesPath
      ? hash(fs.readFileSync(referencesPath))
      : null;
  const { createServer } = require('vite');
  const server = await createServer({
    configFile: false,
    root: path.resolve(__dirname, '../../..'),
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  let normalizeLyricsDocument;
  try {
    ({ normalizeLyricsDocument } = await server.ssrLoadModule(
      '/src/utils/lyricsDocument.js',
    ));
  } finally {
    await server.close();
  }
  fs.mkdirSync(outputRoot);
  const scheduler = createHeavyJobScheduler(),
    results = [];
  let activeJob;
  const cancel = () => {
    void activeJob?.cancel();
  };
  process.once('SIGINT', cancel);
  try {
    const ids = new Set();
    for (const item of items) {
      if (
        !/^[a-z0-9][a-z0-9-]{0,100}$/i.test(item.id) ||
        ids.has(item.id) ||
        !path.isAbsolute(item.audio)
      )
        throw new Error('research case identity');
      ids.add(item.id);
      const trackDir = path.join(outputRoot, item.id);
      fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
      const extension = path.extname(item.audio).toLowerCase();
      if (
        !['.webm', '.wav', '.mp3', '.flac', '.m4a', '.ogg', '.opus'].includes(
          extension,
        )
      )
        throw new Error('research audio extension');
      fs.copyFileSync(item.audio, path.join(trackDir, `audio${extension}`));
      const filename = item.filename ?? 'main.vtt';
      if (!/^[a-z0-9][a-z0-9.-]*\.(?:lrc|vtt)$/i.test(filename))
        throw new Error('research source filename');
      const text = item.lyricsText ?? outerVtt(item.lines);
      fs.writeFileSync(path.join(trackDir, 'lyrics', filename), text);
      const source = researchSource(filename, item.offsetMs ?? 0);
      const context = await prepareAcousticEstimateContext(trackDir, source, {
        method: binding.method,
      });
      const original = normalizeLyricsDocument({
        text,
        source,
        sourceFingerprint: context.source.sha256,
      });
      const canonical = structuredClone(original);
      // This evaluation asks for T1 improvement; fine times remain exclusively in scoring.
      for (const line of canonical.lines) delete line.segments;
      canonical.granularity = 'T1';
      if (
        item.lines &&
        (canonical.lines.length !== item.lines.length ||
          canonical.lines.some((line, i) => line.text !== item.lines[i].text))
      )
        throw new Error('research source normalization mismatch');
      const inputBytes = fs.readFileSync(
        path.join(trackDir, 'lyrics', filename),
      );
      let result;
      try {
        result = await scheduler.schedule({
          jobId: item.id,
          start: () => {
            activeJob = startResearchJob({
              binding,
              trackDir,
              source,
              canonical,
              language: item.language,
              durationMs: item.durationMs,
              jobsRoot: path.join(outputRoot, 'jobs'),
              onProgress: (event) =>
                process.stdout.write(
                  `${JSON.stringify({ caseId: item.id, stage: event.stage, window: event.window })}\n`,
                ),
            });
            return activeJob;
          },
        });
      } finally {
        activeJob = null;
      }
      if (
        !inputBytes.equals(
          fs.readFileSync(path.join(trackDir, 'lyrics', filename)),
        )
      )
        throw new Error('canonical source changed');
      results.push({
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
      fs.writeFileSync(
        path.join(outputRoot, 'results.json'),
        JSON.stringify(
          {
            method: binding.method,
            inputSha256,
            referenceSha256,
            cases: results,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    await scheduler.shutdown();
  }
  // References are parsed only after all inference; never supplied to either worker.
  const references = referencesPath ? readJson(referencesPath) : {};
  const scored = scoreResults(items, results, references);
  const summary = {
    evaluationSha256,
    method: binding.method,
    inputSha256,
    referenceSha256,
    cases: scored,
  };
  fs.writeFileSync(
    path.join(outputRoot, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  return summary;
}

if (require.main === module) {
  const [runtimeConfig, casesPath, referencesPath, outputRoot] =
    process.argv.slice(2);
  runEvaluation({
    runtimeConfig,
    casesPath,
    referencesPath: referencesPath === '-' ? null : referencesPath,
    outputRoot,
  }).then(
    (result) => {
      process.stdout.write(
        `${JSON.stringify({ completed: result.cases.length, inputSha256: result.inputSha256 })}\n`,
      );
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
module.exports = {
  outerVtt,
  scoreCase,
  summarize,
  runEvaluation,
  providerReferenceRows,
  researchSource,
  scoreResults,
};
