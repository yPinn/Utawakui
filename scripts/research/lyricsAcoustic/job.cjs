'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createProcessGroup } = require('./process.cjs');
const {
  recipe,
  lexicalUnits,
  japaneseWords,
  textCuts,
  planWindows,
  mapStarts,
} = require('./protocol.cjs');
const {
  buildKuromojiTokenizer,
} = require('../../../electron/lib/japaneseReading/analyzers/kuromoji');
const {
  getKuromojiDicPath,
} = require('../../../electron/lib/kuromojiDictionary');
const {
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const {
  buildAcousticChunks,
} = require('../../../shared/lyricsAcousticEstimate.mjs');

function removeWorkspace(jobsRoot, workspace) {
  const relative = path.relative(jobsRoot, workspace);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('research cleanup boundary');
  fs.rmSync(workspace, { recursive: true, force: true });
}

function startResearchJob({
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
  timeoutMs = 1200000,
}) {
  const deadlineAt = Date.now() + timeoutMs;
  const group = groupFactory({ timeoutMs });
  let cancelled = false,
    workspace;
  const snapshot = structuredClone(canonical),
    selectedSource = { ...source };
  const check = () => {
    if (Date.now() >= deadlineAt) throw new Error('research deadline exceeded');
    if (cancelled || !isCurrent())
      throw new Error('research generation cancelled or changed');
  };
  const result = (async () => {
    const started = performance.now();
    try {
      check();
      if (!path.isAbsolute(jobsRoot))
        throw new Error('research workspace must be absolute');
      const context = await prepareAcousticEstimateContext(
        trackDir,
        selectedSource,
        { method: binding.method },
      );
      check();
      if (
        snapshot.source?.sha256 !== context.source.sha256 ||
        snapshot.source?.filename !== selectedSource.filename ||
        snapshot.normalizerProfileId !== context.source.normalizerProfileId
      )
        throw new Error('research canonical source changed');
      createAcousticEstimate(context, snapshot, []); // Validate the entire canonical envelope before inference.
      fs.mkdirSync(jobsRoot, { recursive: true });
      workspace = fs.mkdtempSync(path.join(jobsRoot, 'acoustic-'));
      const reasonsByLine = {},
        inputs = new Map(),
        chunkResults = new Map();
      let tokenize;
      if (language === 'ja')
        tokenize = await buildKuromojiTokenizer(
          require('kuromoji'),
          getKuromojiDicPath(),
        );
      for (const line of snapshot.lines) {
        if (line.segments?.length) {
          reasonsByLine[line.lineId] = 'no-evidence';
          continue;
        }
        try {
          inputs.set(line.lineId, {
            line,
            words:
              language === 'ja'
                ? japaneseWords(line.text, tokenize)
                : lexicalUnits(line.text, language),
          });
        } catch {
          reasonsByLine[line.lineId] = 'unsupported-language';
        }
      }
      const plan = planWindows(
        [...inputs.values()].map((i) => i.line),
        durationMs,
        selectedSource.offsetMs ?? 0,
      );
      Object.assign(reasonsByLine, plan.declined);
      const metrics = {
        recipe,
        windows: [],
        frontendPeakRssBytes: 0,
        pythonPeakRssBytes: 0,
        sourceRole: 'mix',
        language,
      };
      let decoder,
        frontend,
        sequence = 0;
      const ask = async (worker, command, data, optional = false) => {
        check();
        group.check();
        const response = await worker.request({
          id: ++sequence,
          command,
          ...data,
        });
        check();
        group.check();
        if (!response.ok) {
          if (optional) return null;
          throw new Error('research worker failed');
        }
        return response.result;
      };
      for (const window of plan.windows) {
        check();
        group.check();
        const windowStarted = performance.now();
        const prefix = `window-${window.index}`;
        const bytes = await group.capture(
          binding.config.ffmpegPath,
          [
            '-hide_banner',
            '-v',
            'error',
            '-nostdin',
            '-protocol_whitelist',
            'file,pipe',
            '-ss',
            (window.startMs / 1000).toFixed(3),
            '-i',
            path.join(trackDir, context.audioFilename),
            '-t',
            ((window.endMs - window.startMs) / 1000).toFixed(3),
            '-ac',
            '1',
            '-ar',
            '44100',
            '-f',
            'f32le',
            '-',
          ],
          Math.ceil(
            ((window.endMs - window.startMs) * recipe.sampleRate) / 1000,
          ) * 4,
        );
        check();
        if (!bytes.length || bytes.length % 4)
          throw new Error('research invalid PCM');
        const pcm = new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        );
        let peak = 0;
        for (const value of pcm) {
          if (!Number.isFinite(value))
            throw new Error('research nonfinite PCM');
          peak = Math.max(peak, Math.abs(value));
        }
        const audioMs = (pcm.length / recipe.sampleRate) * 1000;
        if (Math.abs(audioMs - (window.endMs - window.startMs)) > 100)
          throw new Error('research audio duration mismatch');
        if (peak <= recipe.silencePeak) {
          for (const lineId of window.lineIds)
            reasonsByLine[lineId] = 'no-evidence';
          metrics.windows.push({ ...window, peak, silence: true });
          continue;
        }
        if (!decoder) {
          decoder = group.rpc(binding.config.pythonPath, [
            '-I',
            '-B',
            '-X',
            `pycache_prefix=${path.join(workspace, 'cache')}`,
            path
              .join(__dirname, 'decoder.py')
              .replace(/\.asar([\\/])/u, '.asar.unpacked$1'),
          ]);
          const info = await ask(decoder, 'initialize', {
            config: binding.config,
            workspace,
          });
          metrics.pythonPeakRssBytes = info.peakRssBytes ?? 0;
        }
        const ready = [];
        for (const lineId of window.lineIds) {
          const input = inputs.get(lineId);
          const prepared = await ask(
            decoder,
            'prepare',
            { language, words: input.words },
            true,
          );
          if (!prepared) {
            reasonsByLine[lineId] = 'unsupported-language';
            continue;
          }
          ready.push({ ...input, prepared });
        }
        if (!ready.length) continue;
        fs.writeFileSync(path.join(workspace, `${prefix}.pcm`), bytes);
        if (!frontend) {
          frontend = group.rpc(process.execPath, [
            path.join(__dirname, 'frontend.cjs'),
          ]);
          await ask(frontend, 'initialize', {
            modelDir: binding.config.modelDir,
            workspace,
          });
        }
        onProgress({
          stage: 'inference-start',
          window: window.index,
          pids: group.pids(),
        });
        const inference = await ask(frontend, 'infer', { prefix });
        metrics.frontendPeakRssBytes = Math.max(
          metrics.frontendPeakRssBytes,
          inference.peakRssBytes ?? 0,
        );
        for (const { line, words, prepared } of ready) {
          const decoded = await ask(
            decoder,
            'decode',
            {
              prefix,
              frames: inference.frames,
              prepared,
              begin: Math.max(
                0,
                (line.startMs -
                  context.source.offsetUsedMs -
                  window.startMs -
                  recipe.paddingMs) /
                  1000,
              ),
              end: Math.min(
                audioMs / 1000,
                (line.endMs -
                  context.source.offsetUsedMs -
                  window.startMs +
                  recipe.paddingMs) /
                  1000,
              ),
            },
            true,
          );
          if (!decoded) {
            reasonsByLine[line.lineId] = 'missing-boundaries';
            continue;
          }
          metrics.pythonPeakRssBytes = Math.max(
            metrics.pythonPeakRssBytes,
            decoded.peakRssBytes ?? 0,
          );
          const starts = mapStarts(
            words,
            decoded.spans,
            window.startMs,
            context.source.offsetUsedMs,
          );
          const chunks = buildAcousticChunks(
            line.text,
            textCuts(line.text, language),
            starts,
            line.startMs,
            line.endMs,
            line.lineId,
          );
          if (chunks) chunkResults.set(line.lineId, chunks);
        }
        for (const suffix of ['.pcm', '-frame.bin', '-edge.bin'])
          fs.rmSync(path.join(workspace, `${prefix}${suffix}`), {
            force: true,
          });
        metrics.windows.push({
          ...window,
          peak,
          seconds: (performance.now() - windowStarted) / 1000,
          analyzedLines: ready.length,
        });
        onProgress({
          stage: 'window-done',
          window: window.index,
          pids: group.pids(),
        });
      }
      check();
      group.check();
      await binding.assertCurrent();
      check();
      group.check();
      await group.close(); // Publication waits for both worker processes to exit.
      check();
      const document = createAcousticEstimate(
        context,
        snapshot,
        snapshot.lines.map((line) => chunkResults.get(line.lineId)),
        { reasonsByLine },
      );
      const estimate = await saveTrackAcousticEstimate(
        trackDir,
        selectedSource,
        document,
        {
          method: binding.method,
          isCurrent: () => !cancelled && Date.now() < deadlineAt && isCurrent(),
        },
      );
      metrics.seconds = (performance.now() - started) / 1000;
      metrics.coordinatorPeakRssBytes = process.resourceUsage().maxRSS * 1024;
      metrics.remainingOwnedPids = group.pids();
      return { estimate, metrics };
    } finally {
      await group.close();
      if (workspace) removeWorkspace(jobsRoot, workspace);
    }
  })();
  return {
    result,
    async cancel() {
      cancelled = true;
      await group.close();
    },
  };
}

module.exports = { startResearchJob };
