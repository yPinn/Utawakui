'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { createProcessGroup } = require('../lyricsAcoustic/process.cjs');
const {
  recipe,
  lexicalUnits,
  textCuts,
  planWindows,
} = require('../lyricsAcoustic/protocol.cjs');
const { alignStarts, decodeWhisperTokens } = require('./protocol.cjs');
const {
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const {
  buildAcousticChunks,
} = require('../../../shared/lyricsAcousticEstimate.mjs');

async function createSession(binding, group, workspace) {
  const config = binding.config;
  if (binding.kind === 'qwen') {
    const worker = group.rpc(config.pythonPath, [
      '-I',
      '-B',
      '-X',
      `pycache_prefix=${path.join(workspace, 'cache')}`,
      '-W',
      'ignore::SyntaxWarning',
      path.join(__dirname, 'qwen_worker.py'),
    ]);
    let id = 0;
    async function ask(command, args) {
      const response = await worker.request({ id: ++id, command, ...args });
      if (!response.ok)
        throw Error(`candidate worker ${command} failed: ${response.error}`);
      return response.result;
    }
    return {
      initialize: () =>
        ask('initialize', {
          workspace,
          vendorDir: config.vendorDir,
          modelDir: config.modelDir,
        }),
      infer: ({ prefix, text, language }) =>
        ask('infer', { prefix, text, language }),
    };
  }
  if (!['base', 'small'].includes(binding.kind)) throw Error('candidate kind');
  const timestampSource = config.timestampSource ?? 'dtw-point';
  if (!['dtw-point', 'token-start'].includes(timestampSource))
    throw Error('candidate timestamp source');
  return {
    initialize: async () => ({ ready: true, loadIncludedInEachWindow: true }),
    async infer({ prefix, language, durationSeconds }) {
      const output = path.join(workspace, prefix);
      const started = performance.now();
      await group.capture(
        config.whisperPath,
        [
          '--no-gpu',
          '--no-flash-attn',
          '--threads',
          '4',
          '--language',
          language,
          ...(timestampSource === 'dtw-point' ? ['--dtw', binding.kind] : []),
          '--model',
          config.modelPath,
          '--file',
          `${output}.wav`,
          '--output-json-full',
          '--output-file',
          output,
          '--no-prints',
        ],
        2097152,
      );
      const file = `${output}.json`;
      if (fs.statSync(file).size > 2097152)
        throw Error('candidate JSON budget');
      const rawBytes = fs.readFileSync(file);
      const document = JSON.parse(rawBytes.toString('latin1'));
      let raw = null;
      if (config.rawEvidenceRoot) {
        const relative = path.relative(config.root, config.rawEvidenceRoot);
        if (
          !path.isAbsolute(config.rawEvidenceRoot) ||
          !relative ||
          relative.startsWith('..') ||
          path.isAbsolute(relative)
        )
          throw Error('candidate evidence boundary');
        const filename = `${path.basename(workspace)}-${prefix}.json`;
        fs.mkdirSync(config.rawEvidenceRoot, { recursive: true });
        fs.writeFileSync(
          path.join(config.rawEvidenceRoot, filename),
          rawBytes,
          { flag: 'wx' },
        );
        raw = {
          filename,
          sha256: crypto.createHash('sha256').update(rawBytes).digest('hex'),
        };
      }
      let spans,
        decline = null;
      try {
        spans = decodeWhisperTokens(document, durationSeconds, timestampSource);
      } catch (error) {
        if (error.message !== 'candidate whisper clock unavailable')
          throw error;
        spans = [];
        decline = error.message;
      }
      return {
        spans,
        decline,
        raw,
        seconds: (performance.now() - started) / 1000,
      };
    },
  };
}
function removeWorkspace(jobsRoot, workspace) {
  const relative = path.relative(jobsRoot, workspace);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw Error('candidate cleanup boundary');
  fs.rmSync(workspace, { recursive: true, force: true });
}
function wav(bytes) {
  const out = Buffer.alloc(44 + bytes.length);
  out.write('RIFF');
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(3, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(16000, 24);
  out.writeUInt32LE(64000, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(32, 34);
  out.write('data', 36);
  out.writeUInt32LE(bytes.length, 40);
  bytes.copy(out, 44);
  return out;
}
function startCandidateJob({
  binding,
  trackDir,
  source,
  canonical,
  durationMs,
  language,
  jobsRoot,
  isCurrent = () => true,
  onProgress = () => {},
  groupFactory = createProcessGroup,
  sessionFactory = createSession,
  timeoutMs = 1200000,
}) {
  const deadline = Date.now() + timeoutMs,
    group = groupFactory({ timeoutMs });
  let cancelled = false,
    workspace;
  const snapshot = structuredClone(canonical),
    selected = { ...source };
  const check = () => {
    if (cancelled || !isCurrent()) throw Error('candidate cancelled');
    if (Date.now() >= deadline) throw Error('candidate deadline');
    group.check();
  };
  const result = (async () => {
    const started = performance.now();
    try {
      check();
      if (!path.isAbsolute(jobsRoot)) throw Error('candidate workspace');
      const context = await prepareAcousticEstimateContext(trackDir, selected, {
        method: binding.method,
      });
      check();
      if (
        snapshot.source?.sha256 !== context.source.sha256 ||
        snapshot.source?.filename !== selected.filename ||
        snapshot.normalizerProfileId !== context.source.normalizerProfileId
      )
        throw Error('candidate source changed');
      createAcousticEstimate(context, snapshot, []);
      fs.mkdirSync(jobsRoot, { recursive: true });
      workspace = fs.mkdtempSync(path.join(jobsRoot, 'candidate-'));
      const reasons = {},
        inputs = [],
        chunks = new Map();
      for (const line of snapshot.lines) {
        if (line.segments?.length) {
          reasons[line.lineId] = 'no-evidence';
          continue;
        }
        try {
          lexicalUnits(line.text, language);
          inputs.push(line);
        } catch {
          reasons[line.lineId] = 'unsupported-language';
        }
      }
      const plan = planWindows(inputs, durationMs, selected.offsetMs ?? 0);
      Object.assign(reasons, plan.declined);
      const metrics = {
        windows: [],
        load: null,
        peakRssBytes: 0,
        recipe: {
          sampleRate: 16000,
          threads: 4,
          dtype: binding.kind === 'qwen' ? 'float32' : 'ggml-f16',
          ...recipe,
        },
      };
      metrics.recipe.sampleRate = 16000;
      let session;
      for (const window of plan.windows) {
        check();
        const windowStarted = performance.now(),
          prefix = `w${window.index}`;
        const bytes = await group.capture(
          binding.config.ffmpegPath,
          [
            '-v',
            'error',
            '-nostdin',
            '-protocol_whitelist',
            'file,pipe',
            '-ss',
            String(window.startMs / 1000),
            '-i',
            path.join(trackDir, context.audioFilename),
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
          16000 * 30 * 4,
        );
        check();
        if (!bytes.length || bytes.length % 4) throw Error('candidate PCM');
        const decodedMs = bytes.length / 64;
        if (Math.abs(decodedMs - (window.endMs - window.startMs)) > 100)
          throw Error('candidate audio duration mismatch');
        let peak = 0;
        for (let i = 0; i < bytes.length; i += 4) {
          const v = bytes.readFloatLE(i);
          if (!Number.isFinite(v)) throw Error('candidate samples');
          peak = Math.max(peak, Math.abs(v));
        }
        if (peak <= recipe.silencePeak) {
          for (const id of window.lineIds) reasons[id] = 'no-evidence';
          continue;
        }
        // Match upstream Qwen float-range normalization for both candidates.
        if (peak > 1)
          for (let i = 0; i < bytes.length; i += 4)
            bytes.writeFloatLE(bytes.readFloatLE(i) / peak, i);
        fs.writeFileSync(path.join(workspace, `${prefix}.pcm`), bytes);
        if (binding.kind !== 'qwen')
          fs.writeFileSync(path.join(workspace, `${prefix}.wav`), wav(bytes));
        if (!session) {
          session = await sessionFactory(binding, group, workspace);
          onProgress({ stage: 'load-start', pids: group.pids() });
          metrics.load = await session.initialize();
          check();
          onProgress({
            stage: 'load-done',
            pids: group.pids(),
            load: metrics.load,
          });
        }
        // Include complete context occurrences once, independent of scoring references.
        const rows = inputs.filter(
          (l) =>
            l.startMs - (selected.offsetMs ?? 0) >= window.startMs &&
            l.endMs - (selected.offsetMs ?? 0) <= window.endMs,
        );
        if (!rows.length) continue;
        onProgress({
          stage: 'inference-start',
          window: window.index,
          pids: group.pids(),
        });
        const inferred = await session.infer({
          prefix,
          text: rows.map((l) => l.text).join('\n'),
          language,
          durationSeconds: bytes.length / 64000,
        });
        check();
        if (
          !Array.isArray(inferred.spans) ||
          inferred.spans.some(
            (s) =>
              !Number.isFinite(s.start) ||
              !Number.isFinite(s.end) ||
              s.start < 0 ||
              s.end < s.start ||
              s.end > decodedMs / 1000,
          )
        )
          throw Error('candidate span outside decoded window');
        metrics.peakRssBytes = Math.max(
          metrics.peakRssBytes,
          inferred.peakRssBytes ?? 0,
        );
        let mapped = new Map(),
          decline = inferred.decline ?? null;
        try {
          mapped = alignStarts(rows, inferred.spans, {
            mode: binding.kind === 'qwen' ? 'exact' : 'asr',
            language,
            windowStartMs: window.startMs,
            offsetMs: selected.offsetMs ?? 0,
          });
        } catch (e) {
          if (!/candidate text mismatch|candidate clock/.test(e.message))
            throw e;
          decline = e.message;
        }
        for (const line of rows.filter((l) =>
          window.lineIds.includes(l.lineId),
        )) {
          const value = buildAcousticChunks(
            line.text,
            textCuts(line.text, language),
            mapped.get(line.lineId) ?? new Map(),
            line.startMs,
            line.endMs,
            line.lineId,
          );
          if (value) chunks.set(line.lineId, value);
        }
        metrics.windows.push({
          ...window,
          seconds: (performance.now() - windowStarted) / 1000,
          inferenceSeconds: inferred.seconds ?? null,
          peak,
          decline,
          spans: inferred.spans.length,
          raw: inferred.raw ?? null,
        });
        onProgress({
          stage: 'window-done',
          window: window.index,
          pids: group.pids(),
        });
        for (const suffix of ['.pcm', '.wav', '.json'])
          fs.rmSync(path.join(workspace, `${prefix}${suffix}`), {
            force: true,
          });
      }
      check();
      await binding.assertCurrent();
      check();
      await group.close();
      if (cancelled || Date.now() >= deadline || !isCurrent())
        throw Error('candidate publication cancelled');
      const document = createAcousticEstimate(
        context,
        snapshot,
        snapshot.lines.map((l) => chunks.get(l.lineId)),
        { reasonsByLine: reasons },
      );
      const estimate = await saveTrackAcousticEstimate(
        trackDir,
        selected,
        document,
        {
          method: binding.method,
          isCurrent: () => !cancelled && Date.now() < deadline && isCurrent(),
        },
      );
      metrics.seconds = (performance.now() - started) / 1000;
      metrics.remainingOwnedPids = group.pids();
      return { estimate, metrics };
    } finally {
      await group.close();
      if (workspace) removeWorkspace(jobsRoot, workspace);
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
module.exports = { startCandidateJob, createSession };
