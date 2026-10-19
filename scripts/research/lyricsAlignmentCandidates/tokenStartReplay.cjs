'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { sha, fileHash, bindCandidate } = require('./assets.cjs');
const { startCandidateJob } = require('./job.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { lexicalUnits, planWindows } = require('../lyricsAcoustic/protocol.cjs');
const {
  acousticEstimatePath,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
function validateReplayContext(
  kind,
  priorMethod,
  currentMethod,
  planned,
  recorded,
) {
  if (
    priorMethod?.kind !== 'model' ||
    priorMethod.id !== `${kind}-candidate-research` ||
    priorMethod.modelManifestSha256 !== currentMethod.modelManifestSha256
  )
    throw Error('replay model context');
  const result = new Map();
  for (const window of recorded) {
    const expected = planned.find((w) => w.index === window.index);
    if (
      !expected ||
      result.has(window.index) ||
      expected.startMs !== window.startMs ||
      expected.endMs !== window.endMs ||
      JSON.stringify(expected.lineIds) !== JSON.stringify(window.lineIds)
    )
      throw Error('replay window context');
    result.set(window.index, window);
  }
  return result;
}
function partialTokenStarts(document, durationSeconds) {
  const tokens = document?.transcription?.flatMap((s) => s.tokens ?? []);
  if (
    !Array.isArray(tokens) ||
    tokens.length > 8192 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 30
  )
    throw Error('replay token budget');
  const spans = [];
  let bytes = 0,
    previous = 0,
    missing = 0;
  for (const token of tokens) {
    if (!Number.isInteger(token.id) || token.id < 0)
      throw Error('replay token id');
    if (token.id >= 50257) continue;
    if (typeof token.text !== 'string') throw Error('replay token text');
    const raw = Buffer.from(token.text, 'latin1');
    bytes += raw.length;
    if (bytes > 32768) throw Error('replay byte budget');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    if (!text.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]/gu, '')) continue;
    const from = token.offsets?.from;
    const valid =
      Number.isSafeInteger(from) &&
      from >= 0 &&
      from / 1000 >= previous &&
      from / 1000 <= durationSeconds;
    if (valid) previous = from / 1000;
    else missing++;
    // An untimed token retains its text in the LCS, but exposes no boundary.
    // The placeholder clock is never eligible to become a cut; no clamp/DTW fallback.
    spans.push({ text, start: previous, end: previous, boundary: valid });
  }
  return { spans, missing };
}
async function runReplay(
  configFile,
  kind,
  casesFile,
  referencesFile,
  strictRoot,
  outputRoot,
) {
  if (
    !['base', 'small'].includes(kind) ||
    !path.isAbsolute(outputRoot) ||
    fs.existsSync(outputRoot)
  )
    throw Error('new replay output required');
  const config = JSON.parse(fs.readFileSync(configFile)),
    manifest = JSON.parse(fs.readFileSync(config.manifest));
  const binding = await bindCandidate(kind, config[kind], manifest[kind]);
  const input = fs.readFileSync(casesFile),
    refs = referencesFile === '-' ? null : fs.readFileSync(referencesFile);
  if (input.length > 2097152 || (refs?.length ?? 0) > 2097152)
    throw Error('replay manifest budget');
  const items = JSON.parse(input),
    priorBytes = fs.readFileSync(path.join(strictRoot, 'results.json')),
    prior = JSON.parse(priorBytes);
  if (
    prior.inputSha256 !== sha(input) ||
    prior.referenceSha256 !== (refs ? sha(refs) : null) ||
    items.length !== prior.cases.length
  )
    throw Error('replay frozen input');
  const replayHash = await fileHash(__filename),
    originalMethod = binding.method;
  binding.method = {
    ...binding.method,
    id: `${kind}-token-valid-cuts`,
    version: 'replay-v1',
    decoderVersion: `valid-token-${replayHash.slice(0, 16)}`,
    environmentLockSha256: sha(
      JSON.stringify([
        originalMethod.environmentLockSha256,
        prior.method,
        sha(priorBytes),
        replayHash,
      ]),
    ),
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  const results = [];
  let active,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    void active?.cancel();
  };
  process.once('SIGINT', cancel);
  try {
    for (let index = 0; index < items.length; index++) {
      if (cancelled) throw Error('replay cancelled');
      const item = items[index],
        old = prior.cases[index];
      if (item.id !== old.id || !/^[a-z0-9-]{1,100}$/i.test(item.id))
        throw Error('replay case identity');
      const trackDir = path.join(outputRoot, item.id),
        sourceDir = path.join(strictRoot, item.id),
        filename = old.canonical.source.filename;
      fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
      const audio = fs
        .readdirSync(sourceDir)
        .find((n) => /^audio\.(wav|webm|mp3|flac|m4a|ogg|opus)$/.test(n));
      const oldSidecar = JSON.parse(
        fs.readFileSync(acousticEstimatePath(sourceDir, filename)),
      );
      if (
        !audio ||
        (await fileHash(path.join(sourceDir, audio))) !==
          oldSidecar.audio.sha256
      )
        throw Error('replay media changed');
      fs.copyFileSync(path.join(sourceDir, audio), path.join(trackDir, audio));
      fs.copyFileSync(
        path.join(sourceDir, 'lyrics', filename),
        path.join(trackDir, 'lyrics', filename),
      );
      const eligible = old.canonical.lines.filter((line) => {
        if (line.segments?.length) return false;
        try {
          lexicalUnits(line.text, item.language);
          return true;
        } catch {
          return false;
        }
      });
      const windows = validateReplayContext(
        kind,
        prior.method,
        originalMethod,
        planWindows(eligible, item.durationMs, item.offsetMs ?? 0).windows,
        old.metrics.windows,
      );
      let missing = 0;
      active = startCandidateJob({
        binding,
        trackDir,
        source: { filename, kind: 'manual', offsetMs: item.offsetMs ?? 0 },
        canonical: old.canonical,
        language: item.language,
        durationMs: item.durationMs,
        jobsRoot: path.join(outputRoot, 'jobs'),
        isCurrent: () => !cancelled,
        sessionFactory: async () => ({
          initialize: async () => ({ replayed: true }),
          infer: async ({ prefix, durationSeconds, language }) => {
            if (!/^w\d+$/.test(prefix)) throw Error('replay window context');
            const window = windows.get(Number(prefix.slice(1)));
            if (!window?.raw) throw Error('replay raw evidence missing');
            const name = window.raw.filename;
            if (
              path.basename(name) !== name ||
              !/^[a-zA-Z0-9-]+\.json$/.test(name)
            )
              throw Error('replay raw filename');
            const bytes = fs.readFileSync(
              path.join(config[kind].rawEvidenceRoot, name),
            );
            if (bytes.length > 2097152 || sha(bytes) !== window.raw.sha256)
              throw Error('replay raw integrity');
            const document = JSON.parse(bytes.toString('latin1'));
            if (
              document.model?.type !== kind ||
              document.params?.language !== language
            )
              throw Error('replay raw model language');
            const result = partialTokenStarts(document, durationSeconds);
            missing += result.missing;
            return result;
          },
        }),
      });
      const result = await active.result;
      active = null;
      results.push({
        ...old,
        estimate: result.estimate,
        metrics: {
          ...old.metrics,
          remainingOwnedPids: result.metrics.remainingOwnedPids,
          replay: {
            seconds: result.metrics.seconds,
            modelInferenceReused: true,
            missingTokenClocks: missing,
            rawInputMethod: prior.method,
          },
        },
      });
      fs.writeFileSync(
        path.join(outputRoot, 'results.json'),
        JSON.stringify(
          {
            method: binding.method,
            inputSha256: sha(input),
            referenceSha256: refs ? sha(refs) : null,
            cases: results,
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          replayed: kind,
          caseId: item.id,
          missingTokenClocks: missing,
        }),
      );
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    await active?.cancel();
  }
  const summary = {
    method: binding.method,
    inputSha256: sha(input),
    referenceSha256: refs ? sha(refs) : null,
    evaluatorSha256: await fileHash(
      require.resolve('../lyricsAcoustic/evaluate.cjs'),
    ),
    replaySha256: replayHash,
    cases: scoreResults(items, results, refs ? JSON.parse(refs) : {}),
  };
  fs.writeFileSync(
    path.join(outputRoot, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  return summary;
}
if (require.main === module)
  runReplay(...process.argv.slice(2)).then(
    () => {},
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
module.exports = { partialTokenStarts, runReplay, validateReplayContext };
