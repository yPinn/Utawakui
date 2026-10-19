'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { sha, fileHash } = require('./assets.cjs');
const {
  plannedWindows,
  prepareBinding,
  validateFrozenCases,
  readAsrWindow,
} = require('./qualityRun.cjs');
const {
  conservativeProfiles,
  conservativeRules,
  assessConservative,
} = require('./qualityConservative.cjs');
const { textCuts } = require('../lyricsAcoustic/protocol.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { verifyResults } = require('../lyricsAcoustic/verify.cjs');
const {
  buildAcousticChunks,
} = require('../../../shared/lyricsAcousticEstimate.mjs');
const {
  acousticEstimatePath,
  loadTrackAcousticEstimate,
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
function assertCacheSeed(cache, qbytes, asrBytes) {
  if (
    cache.methodSeed !==
    sha(JSON.stringify([sha(qbytes), sha(asrBytes.base), sha(asrBytes.small)]))
  )
    throw Error('quality cached receipt seed');
}
function assertMissingAsrWindow(recorded, index, spans) {
  if (recorded.some((w) => w.index === index) || spans.length)
    throw Error('quality cached missing ASR');
}
function validateCachedWindows(planned, cached) {
  if (!Array.isArray(cached) || planned.length !== cached.length)
    throw Error('quality cached windows');
  for (let i = 0; i < planned.length; i++) {
    const a = planned[i],
      b = cached[i];
    if (
      a.index !== b.index ||
      a.startMs !== b.startMs ||
      a.endMs !== b.endMs ||
      JSON.stringify(a.lineIds) !== JSON.stringify(b.lineIds) ||
      !Number.isSafeInteger(b.durationMs * 16) ||
      b.durationMs <= 0 ||
      b.durationMs > 30000 ||
      Math.abs(b.durationMs - (b.endMs - b.startMs)) > 100 ||
      !Array.isArray(b.vad?.probabilities) ||
      b.vad.probabilities.length !== Math.ceil(b.durationMs / 32) ||
      b.vad.probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1)
    )
      throw Error('quality cached windows');
  }
  return cached;
}
async function runQualityReplay(
  configFile,
  casesFile,
  referencesFile,
  qwenRoot,
  baseRoot,
  smallRoot,
  qualityRoot,
  outputRoot,
  expectedEvidenceSha,
) {
  if (!path.isAbsolute(outputRoot) || fs.existsSync(outputRoot))
    throw Error('quality fresh replay output');
  const read = (file) => {
    if (fs.statSync(file).size > 16777216) throw Error('quality replay budget');
    return fs.readFileSync(file);
  };
  const input = read(casesFile),
    refs = referencesFile === '-' ? null : read(referencesFile),
    qbytes = read(path.join(qwenRoot, 'results.json')),
    eb = read(path.join(qualityRoot, 'evidence.json'));
  if (
    !/^[a-f0-9]{64}$/.test(expectedEvidenceSha) ||
    sha(eb) !== expectedEvidenceSha
  )
    throw Error('quality evidence hash');
  const prior = JSON.parse(qbytes),
    items = JSON.parse(input),
    cache = JSON.parse(eb),
    asr = {},
    asrBytes = {};
  for (const [kind, dir] of [
    ['base', baseRoot],
    ['small', smallRoot],
  ]) {
    asrBytes[kind] = read(path.join(dir, 'results.json'));
    asr[kind] = JSON.parse(asrBytes[kind]);
  }
  assertCacheSeed(cache, qbytes, asrBytes);
  if (
    prior.inputSha256 !== sha(input) ||
    prior.referenceSha256 !== (refs ? sha(refs) : null) ||
    cache.inputSha256 !== prior.inputSha256 ||
    cache.referenceSha256 !== prior.referenceSha256 ||
    cache.cases.length !== items.length
  )
    throw Error('quality replay input');
  validateFrozenCases(items, prior, asr);
  const bindings = await prepareBinding(configFile);
  const former = JSON.parse(
    read(path.join(qualityRoot, 'base-baseline/results.json')),
  ).method;
  if (
    former.modelManifestSha256 !==
    sha(
      JSON.stringify([
        bindings.qwen.method.modelManifestSha256,
        bindings.asr.base.method.modelManifestSha256,
        bindings.config.vadSha256,
      ]),
    )
  )
    throw Error('quality cached model');
  const methodSeed = sha(
    JSON.stringify([
      sha(qbytes),
      expectedEvidenceSha,
      cache.methodSeed,
      conservativeRules,
    ]),
  );
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  process.once('SIGINT', cancel);
  const check = () => {
    if (cancelled) throw Error('quality replay cancelled');
  };
  const collected = {};
  fs.mkdirSync(outputRoot, { recursive: true });
  try {
    for (let index = 0; index < items.length; index++) {
      check();
      const item = items[index],
        old = prior.cases[index],
        canonical = old.canonical,
        cached = cache.cases[index];
      if (cached.id !== item.id) throw Error('quality cached case');
      const windows = validateCachedWindows(
          plannedWindows(item, canonical),
          cached.windows,
        ),
        source = {
          filename: canonical.source.filename,
          kind: 'manual',
          offsetMs: item.offsetMs ?? 0,
        };
      const oldDir = path.join(qwenRoot, item.id),
        sidecar = JSON.parse(
          read(acousticEstimatePath(oldDir, source.filename)),
        );
      if (
        sidecar.method.modelManifestSha256 !==
          bindings.qwen.method.modelManifestSha256 ||
        JSON.stringify(
          await loadTrackAcousticEstimate(oldDir, source, {
            method: sidecar.method,
          }),
        ) !== JSON.stringify(old.estimate)
      )
        throw Error('quality replay Qwen context');
      const audio = fs
        .readdirSync(oldDir)
        .find((n) => /^audio\.(wav|webm|mp3|flac|m4a|ogg|opus)$/.test(n));
      if (!audio) throw Error('quality replay audio');
      for (const [kind, dir] of [
        ['base', baseRoot],
        ['small', smallRoot],
      ]) {
        const a = asr[kind],
          c = a.cases[index],
          ad = path.join(dir, item.id),
          sd = JSON.parse(read(acousticEstimatePath(ad, source.filename)));
        if (
          sd.audio.sha256 !== sidecar.audio.sha256 ||
          JSON.stringify(
            await loadTrackAcousticEstimate(ad, source, { method: a.method }),
          ) !== JSON.stringify(c.estimate)
        )
          throw Error('quality replay ASR context');
        for (const w of windows) {
          const spans = w.asr[kind].spans;
          if (w.asr[kind].sha256 === null) {
            assertMissingAsrWindow(c.metrics.windows, w.index, spans);
            continue;
          }
          const actual = readAsrWindow(
            bindings.config[kind],
            kind,
            { method: a.method, ...c },
            bindings.asr[kind].method,
            plannedWindows(item, canonical),
            w,
            item.language,
            w.durationMs,
          );
          if (
            actual.sha256 !== w.asr[kind].sha256 ||
            JSON.stringify(actual.spans) !== JSON.stringify(spans)
          )
            throw Error('quality cached ASR changed');
        }
      }
      await bindings.qwen.assertCurrent();
      for (const b of Object.values(bindings.asr)) await b.assertCurrent();
      check();
      for (const profile of conservativeProfiles) {
        const method = {
          ...bindings.qwen.method,
          id: `qwen-quality-v2-${profile}`,
          version: 'quality-v2',
          modelManifestSha256: sha(
            JSON.stringify([
              bindings.qwen.method.modelManifestSha256,
              bindings.asr.base.method.modelManifestSha256,
              bindings.asr.small.method.modelManifestSha256,
              bindings.config.vadSha256,
            ]),
          ),
          environmentLockSha256: sha(
            JSON.stringify([
              bindings.qwen.method,
              bindings.asr.base.method,
              bindings.asr.small.method,
              methodSeed,
              profile,
            ]),
          ),
        };
        const trackDir = path.join(outputRoot, profile, item.id);
        fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
        fs.copyFileSync(path.join(oldDir, audio), path.join(trackDir, audio));
        fs.copyFileSync(
          path.join(oldDir, 'lyrics', source.filename),
          path.join(trackDir, 'lyrics', source.filename),
        );
        const context = await prepareAcousticEstimateContext(trackDir, source, {
          method,
        });
        check();
        if (
          context.audio.sha256 !== sidecar.audio.sha256 ||
          context.source.sha256 !== canonical.source.sha256 ||
          context.source.timingSha256 !== sidecar.source.timingSha256 ||
          context.source.offsetUsedMs !== sidecar.source.offsetUsedMs
        )
          throw Error('quality replay source changed');
        const stats = [],
          chunks = canonical.lines.map((line, i) => {
            const oldLine = old.estimate.preview.lines[i];
            if (
              ['lineId', 'text', 'startMs', 'endMs'].some(
                (k) => oldLine[k] !== line[k],
              )
            )
              throw Error('quality replay line');
            const starts = new Map(
                oldLine.chunks.map((c) => [c.from, c.startMs]),
              ),
              w = windows.find((w) => w.lineIds.includes(line.lineId));
            if (!starts.size || !w) return undefined;
            const e = {
              language: item.language,
              windowStartMs: w.startMs,
              offsetMs: item.offsetMs ?? 0,
              durationMs: w.durationMs,
              probabilities: w.vad.probabilities,
            };
            const result = assessConservative(
                line,
                starts,
                { ...e, asrSpans: w.asr.base.spans },
                { ...e, asrSpans: w.asr.small.spans },
                profile,
              ),
              { starts: accepted, ...metrics } = result;
            stats.push({ lineId: line.lineId, ...metrics });
            return buildAcousticChunks(
              line.text,
              textCuts(line.text, item.language),
              accepted,
              line.startMs,
              line.endMs,
              line.lineId,
            );
          });
        check();
        const doc = createAcousticEstimate(context, canonical, chunks),
          estimate = await saveTrackAcousticEstimate(trackDir, source, doc, {
            method,
            isCurrent: () => !cancelled,
          });
        const result = {
          ...old,
          estimate,
          qualityMethod: method,
          metrics: {
            remainingOwnedPids: [],
            windows: old.metrics.windows,
            quality: { profile, stats, replayedEvidence: true },
          },
        };
        (collected[profile] ??= []).push(result);
        fs.writeFileSync(
          path.join(outputRoot, profile, 'results.json'),
          JSON.stringify(
            {
              method,
              inputSha256: sha(input),
              referenceSha256: refs ? sha(refs) : null,
              methodSeed,
              cases: collected[profile],
            },
            null,
            2,
          ),
        );
      }
      console.log(JSON.stringify({ replayed: item.id, completed: index + 1 }));
    }
  } finally {
    process.removeListener('SIGINT', cancel);
  }
  for (const [profile, results] of Object.entries(collected)) {
    const dir = path.join(outputRoot, profile);
    fs.writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify(
        {
          profile,
          methodSeed,
          inputSha256: sha(input),
          referenceSha256: refs ? sha(refs) : null,
          rules: conservativeRules,
          evaluatorSha256: await fileHash(
            require.resolve('../lyricsAcoustic/evaluate.cjs'),
          ),
          cases: scoreResults(items, results, refs ? JSON.parse(refs) : {}),
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(dir, 'verification.json'),
      JSON.stringify({ checks: verifyResults(results) }, null, 2),
    );
  }
  return { cases: items.length, profiles: Object.keys(collected) };
}
if (require.main === module)
  runQualityReplay(...process.argv.slice(2)).then(
    (r) => console.log(JSON.stringify(r)),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
module.exports = {
  validateCachedWindows,
  runQualityReplay,
  assertCacheSeed,
  assertMissingAsrWindow,
};
