'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  createProcessGroup,
} = require('../../../scripts/research/lyricsAcoustic/process.cjs');
const {
  verifyAssets,
} = require('../../../scripts/research/lyricsAcoustic/assets.cjs');
const {
  startResearchJob,
} = require('../../../scripts/research/lyricsAcoustic/job.cjs');
const {
  planWindows,
  lexicalUnits,
} = require('../../../scripts/research/lyricsAcoustic/protocol.cjs');
const {
  partialTokenStarts,
} = require('../../../scripts/research/lyricsAlignmentCandidates/tokenStarts.cjs');
const {
  assessCompleteness,
} = require('../../../scripts/research/lyricsFreshEvaluation/completeness.cjs');
const { runProbe } = require('../lyricsAcoustic/probe');
const { contained } = require('../lyricsAcoustic/integrity');
const { verifyInstalled } = require('./environment');
const { planLineLanguages } = require('./language');

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
async function ownedGroup(signal, task) {
  signal.throwIfAborted();
  const group = createProcessGroup();
  const cancel = () => {
    void group.close();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const value = await task(group);
    signal.throwIfAborted();
    return value;
  } finally {
    signal.removeEventListener('abort', cancel);
    await group.close();
  }
}
async function whisper(config, group, workspace, bytes, language) {
  const output = path.join(workspace, 'small');
  fs.writeFileSync(`${output}.wav`, wav(bytes));
  await group.capture(
    config.whisperPath,
    [
      '--no-gpu',
      '--no-flash-attn',
      '--threads',
      '4',
      '--language',
      language,
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
  if (fs.statSync(file).size > 2097152) throw Error('research ASR budget');
  const document = JSON.parse(fs.readFileSync(file).toString('latin1'));
  if (
    document.model?.type !== 'small' ||
    document.params?.language !== language
  )
    throw Error('research ASR identity');
  return partialTokenStarts(document, bytes.length / 64000).spans;
}
async function probeResearchModels(config, { signal }) {
  const workspace = fs.mkdtempSync(
    path.join(path.dirname(config.environmentPath), 'probe-'),
  );
  try {
    await runProbe(
      process.execPath,
      [
        require.resolve('../lyricsAcoustic/probe'),
        '--node',
        path.join(config.modelDir, 'model.onnx'),
      ],
      { signal, nodeMode: true },
    );
    await ownedGroup(signal, async (group) => {
      const decoder = group.rpc(config.pythonPath, [
        '-I',
        '-B',
        '-X',
        `pycache_prefix=${path.join(workspace, 'cache')}`,
        path
          .resolve(
            __dirname,
            '../../../scripts/research/lyricsAcoustic/decoder.py',
          )
          .replace(/\.asar([\\/])/u, '.asar.unpacked$1'),
      ]);
      const response = await decoder.request({
        id: 1,
        command: 'initialize',
        config,
        workspace,
      });
      if (!response.ok) throw Error('research decoder load failed');
      const english = await decoder.request({
        id: 2,
        command: 'prepare',
        language: 'en',
        words: [
          { text: 'love', roman: ['love'] },
          { text: "don't", roman: ["don't"] },
        ],
      });
      if (!english.ok) throw Error('research English dictionary load failed');
      await whisper(config, group, workspace, Buffer.alloc(3 * 64000), 'zh');
    });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
async function runResearchPreview(
  input,
  {
    signal,
    onProgress,
    language,
    lineIndex,
    config,
    jobsRoot,
    wholeSong = false,
  },
  dependencies = {},
) {
  const verify = dependencies.verifyInstalled ?? verifyInstalled;
  const bind = dependencies.verifyAssets ?? verifyAssets;
  const start = dependencies.startResearchJob ?? startResearchJob;
  const withGroup = dependencies.ownedGroup ?? ownedGroup;
  const transcribe = dependencies.whisper ?? whisper;
  signal.throwIfAborted();
  const installation = path.resolve(config.modelDir, '../../..');
  await verify(installation, signal);
  const binding = await bind(config);
  const selected = input.canonical.lines[lineIndex];
  if (
    !wholeSong &&
    (!selected ||
      !Number.isSafeInteger(selected.startMs) ||
      !Number.isSafeInteger(selected.endMs))
  )
    throw Error('research timed line required');
  const canonical = structuredClone(input.canonical);
  if (!wholeSong)
    canonical.lines = canonical.lines
      .filter(
        (line, index) =>
          index >= lineIndex &&
          line.startMs >= selected.startMs &&
          line.endMs <= selected.startMs + 24000,
      )
      .slice(0, 10);
  if (!canonical.lines.length)
    throw Error('research line exceeds preview budget');
  const routing = planLineLanguages(canonical.lines, language);
  const languages = new Map(
    routing.lines.map((line) => [line.lineId, line.language]),
  );
  const plans = planWindows(
    canonical.lines.filter((line) => {
      if (line.segments?.length) return false;
      try {
        const lineLanguage = languages.get(line.lineId);
        if (!lineLanguage) return false;
        lexicalUnits(line.text, lineLanguage);
        return true;
      } catch {
        return false;
      }
    }),
    input.durationMs,
    input.source.offsetMs ?? 0,
  ).windows;
  if (plans.length > (wholeSong ? 1000 : 2))
    throw Error('research preview window budget');
  contained(path.dirname(jobsRoot), jobsRoot);
  fs.mkdirSync(jobsRoot, { recursive: true });
  const workspace = fs.mkdtempSync(path.join(jobsRoot, 'preview-'));
  try {
    const trackDir = path.join(workspace, 'track');
    fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
    fs.copyFileSync(input.audioPath, path.join(trackDir, input.audioFilename));
    fs.writeFileSync(
      path.join(trackDir, 'lyrics', input.source.filename),
      input.text,
    );
    signal.throwIfAborted();
    onProgress(
      plans.length
        ? { stage: 'alignment', completed: 0, total: plans.length }
        : 'hubertfa',
    );
    const job = start({
      binding,
      trackDir,
      source: input.source,
      canonical,
      durationMs: input.durationMs,
      language,
      lineLanguages: routing.lines,
      jobsRoot: path.join(workspace, 'workers'),
      onProgress: (event) => {
        if (
          event.stage === 'window-done' &&
          Number.isInteger(event.window) &&
          plans.length
        )
          onProgress({
            stage: 'alignment',
            completed: Math.min(plans.length, event.window + 1),
            total: plans.length,
          });
      },
      isCurrent: () => !signal.aborted,
    });
    const cancel = () => {
      void job.cancel().catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    let hfa;
    try {
      hfa = await job.result;
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancel);
      await job.cancel();
    }
    onProgress('small');
    const decisions = new Map();
    const contentGroups = new Map(
      plans.map((window) => {
        const rows = canonical.lines.filter((line) =>
          window.lineIds.includes(line.lineId),
        );
        return [
          window.index,
          [...new Set(rows.map((line) => languages.get(line.lineId)))].map(
            (lineLanguage) => ({
              language: lineLanguage,
              lines: rows.filter(
                (line) => languages.get(line.lineId) === lineLanguage,
              ),
            }),
          ),
        ];
      }),
    );
    const contentTotal = [...contentGroups.values()]
      .flat()
      .reduce(
        (sum, entry) =>
          sum + (entry.language === 'en' ? entry.lines.length : 1),
        0,
      );
    let completedWindows = 0;
    await withGroup(signal, async (group) => {
      for (const window of plans) {
        onProgress({
          stage: 'content',
          completed: completedWindows,
          total: contentTotal,
        });
        signal.throwIfAborted();
        const bytes = await group.capture(
          config.ffmpegPath,
          [
            '-v',
            'error',
            '-nostdin',
            '-protocol_whitelist',
            'file,pipe',
            '-ss',
            String(window.startMs / 1000),
            '-i',
            path.join(trackDir, input.audioFilename),
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
          Math.ceil((window.endMs - window.startMs) * 64),
        );
        if (
          !bytes.length ||
          bytes.length % 4 ||
          Math.abs(bytes.length / 64 - (window.endMs - window.startMs)) > 100
        )
          throw Error('research PCM duration');
        for (const { language: lineLanguage, lines } of contentGroups.get(
          window.index,
        )) {
          signal.throwIfAborted();
          const spans =
            lineLanguage === 'en'
              ? null
              : await transcribe(config, group, workspace, bytes, lineLanguage);
          signal.throwIfAborted();
          for (const line of lines) {
            signal.throwIfAborted();
            const begin = Math.round(
              (line.startMs - (input.source.offsetMs ?? 0) - window.startMs) *
                16,
            );
            const end = Math.round(
              (line.endMs - (input.source.offsetMs ?? 0) - window.startMs) * 16,
            );
            let peak = 0;
            for (
              let i = Math.max(0, begin);
              i < Math.min(bytes.length / 4, end);
              i++
            ) {
              const value = bytes.readFloatLE(i * 4);
              if (!Number.isFinite(value))
                throw Error('research nonfinite PCM');
              peak = Math.max(peak, Math.abs(value));
            }
            if (
              begin >= 0 &&
              end <= bytes.length / 4 &&
              end > begin &&
              peak <= 1e-6
            ) {
              decisions.set(line.lineId, {
                reject: true,
                silent: true,
                evidenceState: 'insufficient',
              });
            } else if (lineLanguage === 'en') {
              // A local blind transcript avoids assigning a 30-second segment's
              // approximate token clocks to the wrong lyric occurrence.
              const left = Math.max(0, begin - 8000),
                right = Math.min(bytes.length / 4, end + 8000);
              const local = bytes.subarray(left * 4, right * 4);
              const localStart = window.startMs + left / 16;
              const duration = local.length / 64;
              const localSpans = await transcribe(
                config,
                group,
                workspace,
                local,
                lineLanguage,
              );
              signal.throwIfAborted();
              decisions.set(
                line.lineId,
                assessCompleteness(
                  {
                    ...line,
                    startMs: Math.round(
                      localStart + (input.source.offsetMs ?? 0),
                    ),
                    endMs: Math.round(
                      localStart + duration + (input.source.offsetMs ?? 0),
                    ),
                  },
                  {
                    language: lineLanguage,
                    windowStartMs: Math.round(localStart),
                    offsetMs: input.source.offsetMs ?? 0,
                    durationMs: duration,
                    spans: localSpans,
                  },
                ),
              );
            } else {
              decisions.set(
                line.lineId,
                assessCompleteness(line, {
                  language: lineLanguage,
                  windowStartMs: window.startMs,
                  offsetMs: input.source.offsetMs ?? 0,
                  durationMs: window.endMs - window.startMs,
                  spans,
                }),
              );
            }
            if (lineLanguage === 'en')
              onProgress({
                stage: 'content',
                completed: ++completedWindows,
                total: contentTotal,
              });
          }
          if (lineLanguage !== 'en')
            onProgress({
              stage: 'content',
              completed: ++completedWindows,
              total: contentTotal,
            });
        }
      }
    });
    signal.throwIfAborted();
    // Check both weights and the complete environment again before publication.
    await verify(installation, signal);
    await binding.assertCurrent();
    return {
      researchOnly: true,
      timingAcceptance: 'pending',
      sourceLabel: input.sourceLabel,
      offsetMs: input.source.offsetMs ?? 0,
      lines: canonical.lines.map((line) => {
        const estimate = hfa.estimate.preview.lines.find(
          (candidate) => candidate.lineId === line.lineId,
        );
        const decision = decisions.get(line.lineId);
        const native = Boolean(line.segments?.length);
        const chunks =
          !native &&
          !decision?.reject &&
          languages.get(line.lineId) &&
          (languages.get(line.lineId) !== 'en' ||
            decision?.evidenceState === 'supported') &&
          estimate?.status === 'ready'
            ? estimate.chunks
            : [];
        return {
          ...line,
          chunks,
          mode: native ? 'T2' : chunks.length ? 'research' : 'T1',
          content: decision?.silent
            ? 'silence'
            : decision?.reject
              ? 'contradiction'
              : decision?.insertionWarning
                ? 'possible-missing-lyrics'
                : (decision?.evidenceState ?? 'unconfirmed'),
        };
      }),
    };
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
module.exports = { probeResearchModels, runResearchPreview, wav };
