'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { sha, fileHash, snapshot, bindCandidate } = require('./assets.cjs');
const { createProcessGroup } = require('../lyricsAcoustic/process.cjs');
const {
  lexicalUnits,
  planWindows,
  textCuts,
} = require('../lyricsAcoustic/protocol.cjs');
const {
  partialTokenStarts,
  validateReplayContext,
} = require('./tokenStartReplay.cjs');
const { profiles, qualityRules, assessLine } = require('./quality.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { verifyResults } = require('../lyricsAcoustic/verify.cjs');
const {
  buildAcousticChunks,
} = require('../../../shared/lyricsAcousticEstimate.mjs');
const {
  acousticEstimatePath,
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
  loadTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');

function cleanWorkspace(outputRoot, workspace) {
  const relative = path.relative(path.join(outputRoot, 'jobs'), workspace);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw Error('quality cleanup boundary');
  fs.rmSync(workspace, { recursive: true, force: true });
}

function plannedWindows(item, canonical) {
  const inputs = canonical.lines.filter((l) => {
    if (l.segments?.length) return false;
    try {
      lexicalUnits(l.text, item.language);
      return true;
    } catch {
      return false;
    }
  });
  return planWindows(inputs, item.durationMs, item.offsetMs ?? 0).windows;
}
function readAsrWindow(
  config,
  kind,
  prior,
  currentMethod,
  planned,
  window,
  language,
  durationMs,
) {
  const recorded = validateReplayContext(
    kind,
    prior.method,
    currentMethod,
    planned,
    prior.metrics.windows,
  ).get(window.index);
  if (!recorded?.raw) throw Error('quality raw evidence missing');
  const { filename, sha256 } = recorded.raw;
  if (
    path.basename(filename) !== filename ||
    !/^[a-zA-Z0-9-]+\.json$/.test(filename)
  )
    throw Error('quality raw filename');
  const file = path.join(config.rawEvidenceRoot, filename);
  if (fs.statSync(file).size > 2097152) throw Error('quality raw budget');
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== sha256) throw Error('quality raw hash');
  const document = JSON.parse(bytes.toString('latin1'));
  if (document.model?.type !== kind || document.params?.language !== language)
    throw Error('quality raw model language');
  return {
    sha256,
    spans: partialTokenStarts(document, durationMs / 1000).spans,
  };
}
function validateFrozenCases(items, prior, asr) {
  if (
    items.length !== prior.cases.length ||
    items.some(
      (item, i) =>
        item.id !== prior.cases[i].id || !/^[a-z0-9-]{1,100}$/i.test(item.id),
    )
  )
    throw Error('quality case identity');
  for (const other of Object.values(asr))
    if (
      other.inputSha256 !== prior.inputSha256 ||
      other.referenceSha256 !== prior.referenceSha256 ||
      other.cases.length !== items.length ||
      other.cases.some(
        (c, i) =>
          c.id !== items[i].id ||
          JSON.stringify(c.canonical) !==
            JSON.stringify(prior.cases[i].canonical),
      )
    )
      throw Error('quality ASR context');
}
async function prepareBinding(configFile) {
  const config = JSON.parse(fs.readFileSync(configFile)),
    manifest = JSON.parse(fs.readFileSync(config.manifest));
  if ((await fileHash(config.vadModelPath)) !== config.vadSha256)
    throw Error('quality VAD hash');
  const vadRows = await snapshot(config.vadAssetRoots);
  const qwenConfig = {
    ...config.qwen,
    assetRoots: [...config.qwen.assetRoots, ...config.vadAssetRoots],
  };
  const qwen = await bindCandidate('qwen', qwenConfig, [
    ...manifest.qwen,
    ...vadRows,
  ]);
  const asr = {};
  for (const kind of ['base', 'small'])
    asr[kind] = await bindCandidate(kind, config[kind], manifest[kind]);
  return { config, qwen, asr };
}

function startQualityJob({
  bindings,
  item,
  old,
  asrCases,
  asrSourceDirs,
  trackSourceDir,
  outputRoot,
  methodSeed,
  isCurrent = () => true,
  onProgress = () => {},
  timeoutMs = 120000,
  selectedProfiles = profiles.flatMap((p) =>
    ['base', 'small'].map((k) => `${k}-${p}`),
  ),
  groupFactory = createProcessGroup,
}) {
  const { config, qwen } = bindings,
    group = groupFactory({ timeoutMs }),
    deadline = Date.now() + timeoutMs;
  let cancelled = false,
    closed = false,
    workspace;
  const check = () => {
    if (cancelled || !isCurrent()) throw Error('quality cancelled');
    if (Date.now() >= deadline) throw Error('quality deadline');
    if (!closed) group.check();
  };
  const result = (async () => {
    const started = performance.now();
    try {
      check();
      if (!path.isAbsolute(outputRoot)) throw Error('quality output boundary');
      const canonical = structuredClone(old.canonical),
        filename = canonical.source.filename;
      if (path.basename(filename) !== filename)
        throw Error('quality source filename');
      const source = { filename, kind: 'manual', offsetMs: item.offsetMs ?? 0 };
      const oldSidecar = JSON.parse(
        fs.readFileSync(acousticEstimatePath(trackSourceDir, filename)),
      );
      const loaded = await loadTrackAcousticEstimate(trackSourceDir, source, {
        method: oldSidecar.method,
      });
      if (
        JSON.stringify(loaded) !== JSON.stringify(old.estimate) ||
        canonical.lines.length !== oldSidecar.lines.length ||
        canonical.lines.some((l, i) =>
          ['lineId', 'text', 'startMs', 'endMs'].some(
            (k) => l[k] !== oldSidecar.lines[i][k],
          ),
        )
      )
        throw Error('quality frozen estimate');
      if (
        qwen.method.modelManifestSha256 !==
        oldSidecar.method.modelManifestSha256
      )
        throw Error('quality Qwen model context');
      for (const kind of ['base', 'small']) {
        const dir = asrSourceDirs[kind];
        const receipt = JSON.parse(
          fs.readFileSync(acousticEstimatePath(dir, filename)),
        );
        const actual = await loadTrackAcousticEstimate(dir, source, {
          method: asrCases[kind].method,
        });
        if (
          receipt.audio.sha256 !== oldSidecar.audio.sha256 ||
          JSON.stringify(actual) !== JSON.stringify(asrCases[kind].estimate)
        )
          throw Error('quality ASR audio context');
      }
      const audio = fs
        .readdirSync(trackSourceDir)
        .find((n) => /^audio\.(wav|webm|mp3|flac|m4a|ogg|opus)$/.test(n));
      if (
        !audio ||
        (await fileHash(path.join(trackSourceDir, audio))) !==
          oldSidecar.audio.sha256
      )
        throw Error('quality audio hash');
      if (
        (await fileHash(path.join(trackSourceDir, 'lyrics', filename))) !==
        canonical.source.sha256
      )
        throw Error('quality source hash');
      fs.mkdirSync(path.join(outputRoot, 'jobs'), { recursive: true });
      workspace = fs.mkdtempSync(path.join(outputRoot, 'jobs', 'qa-'));
      const planned = plannedWindows(item, canonical),
        windows = [];
      let worker,
        id = 0,
        load = null;
      const ask = async (command, args) => {
        const response = await worker.request({ id: ++id, command, ...args });
        if (!response.ok)
          throw Error(`quality worker ${command} ${response.error}`);
        return response.result;
      };
      for (const window of planned) {
        check();
        const prefix = `w${window.index}`;
        const bytes = await group.capture(
          config.qwen.ffmpegPath,
          [
            '-v',
            'error',
            '-nostdin',
            '-protocol_whitelist',
            'file,pipe',
            '-ss',
            String(window.startMs / 1000),
            '-i',
            path.join(trackSourceDir, audio),
            '-t',
            String((window.endMs - window.startMs) / 1000),
            '-map',
            '0:a:0',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-f',
            'f32le',
            'pipe:1',
          ],
          1920000,
        );
        check();
        if (!bytes.length || bytes.length % 4) throw Error('quality PCM');
        const durationMs = bytes.length / 64;
        if (
          !Number.isSafeInteger(durationMs * 16) ||
          Math.abs(durationMs - (window.endMs - window.startMs)) > 100
        )
          throw Error('quality duration');
        let peak = 0;
        for (let i = 0; i < bytes.length; i += 4) {
          const v = bytes.readFloatLE(i);
          if (!Number.isFinite(v)) throw Error('quality samples');
          peak = Math.max(peak, Math.abs(v));
        }
        if (peak > 1)
          for (let i = 0; i < bytes.length; i += 4)
            bytes.writeFloatLE(bytes.readFloatLE(i) / peak, i);
        fs.writeFileSync(path.join(workspace, `${prefix}.pcm`), bytes);
        if (!worker) {
          worker = group.rpc(config.qwen.pythonPath, [
            '-I',
            '-B',
            '-X',
            `pycache_prefix=${path.join(workspace, 'cache')}`,
            path.join(__dirname, 'vad_worker.py'),
          ]);
          onProgress({ stage: 'vad-load-start', pids: group.pids() });
          load = await ask('initialize', {
            workspace,
            modelPath: config.vadModelPath,
          });
          check();
          onProgress({ stage: 'vad-load-done', pids: group.pids() });
        }
        onProgress({
          stage: 'vad-inference-start',
          pids: group.pids(),
          window: window.index,
        });
        const vad = await ask('infer', { prefix });
        check();
        if (
          !Array.isArray(vad.probabilities) ||
          vad.probabilities.length !== Math.ceil(durationMs / 32) ||
          vad.probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1)
        )
          throw Error('quality VAD evidence');
        const asr = {};
        for (const kind of ['base', 'small'])
          asr[kind] =
            peak <= 1e-8
              ? { sha256: null, spans: [] }
              : readAsrWindow(
                  config[kind],
                  kind,
                  asrCases[kind],
                  bindings.asr[kind].method,
                  planned,
                  window,
                  item.language,
                  durationMs,
                );
        windows.push({
          ...window,
          durationMs,
          pcmSha256: sha(bytes),
          vad,
          asr,
        });
        fs.rmSync(path.join(workspace, `${prefix}.pcm`));
        onProgress({ stage: 'vad-window-done', window: window.index });
      }
      check();
      await qwen.assertCurrent();
      for (const b of Object.values(bindings.asr)) await b.assertCurrent();
      check();
      await group.close();
      closed = true;
      check();
      const outputs = {};
      for (const selection of selectedProfiles) {
        if (
          !/^(base|small)-(baseline|activity|content|combined|combined-time)$/.test(
            selection,
          )
        )
          throw Error('quality selection');
        const kind = selection.startsWith('base-') ? 'base' : 'small',
          profile = selection.slice(kind.length + 1);
        const method = {
          ...qwen.method,
          id: `qwen-quality-${selection}`,
          version: 'quality-v1',
          modelManifestSha256: sha(
            JSON.stringify([
              qwen.method.modelManifestSha256,
              bindings.asr[kind].method.modelManifestSha256,
              config.vadSha256,
            ]),
          ),
          environmentLockSha256: sha(
            JSON.stringify([
              qwen.method,
              bindings.asr[kind].method,
              methodSeed,
              qualityRules,
              selection,
            ]),
          ),
        };
        const trackDir = path.join(outputRoot, selection, item.id);
        fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
        fs.copyFileSync(
          path.join(trackSourceDir, audio),
          path.join(trackDir, audio),
        );
        fs.copyFileSync(
          path.join(trackSourceDir, 'lyrics', filename),
          path.join(trackDir, 'lyrics', filename),
        );
        const context = await prepareAcousticEstimateContext(trackDir, source, {
          method,
        });
        if (
          context.audio.sha256 !== oldSidecar.audio.sha256 ||
          context.source.sha256 !== canonical.source.sha256 ||
          context.source.timingSha256 !== oldSidecar.source.timingSha256 ||
          context.source.offsetUsedMs !== oldSidecar.source.offsetUsedMs
        )
          throw Error('quality publication source changed');
        check();
        const stats = [],
          chunks = [];
        for (let i = 0; i < canonical.lines.length; i++) {
          const line = canonical.lines[i],
            existing = old.estimate.preview.lines[i];
          if (existing.lineId !== line.lineId || existing.text !== line.text)
            throw Error('quality estimate context');
          const starts = new Map(
            existing.chunks.map((c) => [c.from, c.startMs]),
          );
          const window = windows.find((w) => w.lineIds.includes(line.lineId));
          if (!starts.size || !window) {
            chunks.push(undefined);
            continue;
          }
          const assessed = assessLine(
            line,
            starts,
            {
              language: item.language,
              windowStartMs: window.startMs,
              offsetMs: item.offsetMs ?? 0,
              durationMs: window.durationMs,
              probabilities: window.vad.probabilities,
              asrSpans: window.asr[kind].spans,
            },
            profile,
          );
          const { starts: accepted, ...metrics } = assessed;
          stats.push({ lineId: line.lineId, ...metrics });
          chunks.push(
            buildAcousticChunks(
              line.text,
              textCuts(line.text, item.language),
              accepted,
              line.startMs,
              line.endMs,
              line.lineId,
            ),
          );
        }
        const doc = createAcousticEstimate(context, canonical, chunks);
        check();
        onProgress({ stage: 'before-publication', selection });
        check();
        const estimate = await saveTrackAcousticEstimate(
          trackDir,
          source,
          doc,
          {
            method,
            isCurrent: () => !cancelled && isCurrent() && Date.now() < deadline,
          },
        );
        outputs[selection] = {
          ...old,
          qualityMethod: method,
          estimate,
          metrics: {
            remainingOwnedPids: [],
            windows: old.metrics.windows,
            quality: {
              profile,
              asr: kind,
              stats,
              load,
              seconds: (performance.now() - started) / 1000,
              reusedQwenAndAsr: true,
            },
          },
        };
      }
      check();
      return {
        outputs,
        windows,
        seconds: (performance.now() - started) / 1000,
        load,
        remainingOwnedPids: group.pids(),
      };
    } finally {
      await group.close();
      if (workspace) cleanWorkspace(outputRoot, workspace);
    }
  })();
  return {
    result,
    cancel: async () => {
      cancelled = true;
      await group.close();
    },
  };
}

async function runQuality(
  configFile,
  casesFile,
  referencesFile,
  qwenRoot,
  baseRoot,
  smallRoot,
  outputRoot,
) {
  if (!path.isAbsolute(outputRoot) || fs.existsSync(outputRoot))
    throw Error('quality fresh absolute output required');
  const input = fs.readFileSync(casesFile),
    refs = referencesFile === '-' ? null : fs.readFileSync(referencesFile);
  const readBound = (file) => {
    if (fs.statSync(file).size > 16777216) throw Error('quality result budget');
    return fs.readFileSync(file);
  };
  const oldBytes = readBound(path.join(qwenRoot, 'results.json')),
    asrBytes = {
      base: readBound(path.join(baseRoot, 'results.json')),
      small: readBound(path.join(smallRoot, 'results.json')),
    };
  const items = JSON.parse(input),
    prior = JSON.parse(oldBytes),
    asr = Object.fromEntries(
      Object.entries(asrBytes).map(([k, b]) => [k, JSON.parse(b)]),
    );
  if (
    input.length > 2097152 ||
    (refs?.length ?? 0) > 2097152 ||
    sha(input) !== prior.inputSha256 ||
    (refs ? sha(refs) : null) !== prior.referenceSha256 ||
    prior.method.id !== 'qwen-candidate-research'
  )
    throw Error('quality frozen inputs');
  validateFrozenCases(items, prior, asr);
  const bindings = await prepareBinding(configFile);
  fs.mkdirSync(outputRoot, { recursive: true });
  const methodSeed = sha(
      JSON.stringify([sha(oldBytes), ...Object.values(asrBytes).map(sha)]),
    ),
    collected = {},
    evidence = [];
  let active,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    void active?.cancel();
  };
  process.once('SIGINT', cancel);
  try {
    for (let i = 0; i < items.length; i++) {
      if (cancelled) throw Error('quality cancelled');
      const item = items[i];
      active = startQualityJob({
        bindings,
        item,
        old: prior.cases[i],
        asrCases: Object.fromEntries(
          Object.entries(asr).map(([k, r]) => [
            k,
            { method: r.method, ...r.cases[i] },
          ]),
        ),
        asrSourceDirs: {
          base: path.join(baseRoot, item.id),
          small: path.join(smallRoot, item.id),
        },
        trackSourceDir: path.join(qwenRoot, item.id),
        outputRoot,
        methodSeed,
        isCurrent: () => !cancelled,
        onProgress: (e) =>
          console.log(JSON.stringify({ caseId: item.id, ...e })),
      });
      const result = await active.result;
      active = null;
      for (const [selection, r] of Object.entries(result.outputs)) {
        (collected[selection] ??= []).push(r);
        const dir = path.join(outputRoot, selection);
        fs.writeFileSync(
          path.join(dir, 'results.json'),
          JSON.stringify(
            {
              method: r.qualityMethod,
              inputSha256: sha(input),
              referenceSha256: refs ? sha(refs) : null,
              cases: collected[selection],
            },
            null,
            2,
          ),
        );
      }
      evidence.push({
        id: item.id,
        windows: result.windows,
        seconds: result.seconds,
        load: result.load,
      });
      fs.writeFileSync(
        path.join(outputRoot, 'evidence.json'),
        JSON.stringify(
          {
            methodSeed,
            inputSha256: sha(input),
            referenceSha256: refs ? sha(refs) : null,
            cases: evidence,
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          completed: i + 1,
          caseId: item.id,
          seconds: result.seconds,
        }),
      );
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    await active?.cancel();
  }
  for (const [selection, results] of Object.entries(collected)) {
    const dir = path.join(outputRoot, selection);
    const summary = {
      selection,
      inputSha256: sha(input),
      referenceSha256: refs ? sha(refs) : null,
      methodSeed,
      rules: qualityRules,
      evaluatorSha256: await fileHash(
        require.resolve('../lyricsAcoustic/evaluate.cjs'),
      ),
      cases: scoreResults(items, results, refs ? JSON.parse(refs) : {}),
    };
    fs.writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify(summary, null, 2),
    );
    fs.writeFileSync(
      path.join(dir, 'verification.json'),
      JSON.stringify({ checks: verifyResults(results) }, null, 2),
    );
  }
  return { cases: items.length, profiles: Object.keys(collected) };
}
if (require.main === module)
  runQuality(...process.argv.slice(2)).then(
    (r) => console.log(JSON.stringify(r)),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
module.exports = {
  plannedWindows,
  readAsrWindow,
  validateFrozenCases,
  prepareBinding,
  startQualityJob,
  runQuality,
};
