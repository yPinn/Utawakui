'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const {
  fileHash,
  sha,
  bindCandidate,
} = require('../lyricsAlignmentCandidates/assets.cjs');
const {
  createSession,
  startCandidateJob,
} = require('../lyricsAlignmentCandidates/job.cjs');
const { lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
const {
  researchSource,
  scoreResults,
} = require('../lyricsAcoustic/evaluate.cjs');
const { verifyResults } = require('../lyricsAcoustic/verify.cjs');
const { validateCandidate } = require('./review.cjs');
function leadingCropMs(lines, language, startMs, endMs) {
  const eligible = lines.filter((l) => {
    try {
      lexicalUnits(l.text, language);
      return l.startMs >= startMs && l.endMs <= endMs;
    } catch {
      return false;
    }
  });
  if (!eligible.length) throw Error('no supported crop text');
  return Math.max(
    0,
    Math.min(...eligible.map((l) => l.startMs)) - startMs - 2000,
  );
}
async function run(root, output) {
  if (!path.isAbsolute(output) || fs.existsSync(output))
    throw Error('new crop output');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'))),
    manifest = JSON.parse(fs.readFileSync(config.manifest)),
    input = fs.readFileSync(path.join(root, 'cases.json')),
    refs = fs.readFileSync(path.join(root, 'references.json')),
    priorBytes = fs.readFileSync(path.join(root, 'qwen/results.json')),
    prior = JSON.parse(priorBytes),
    items = JSON.parse(input).filter(
      (c) => c.variant === 'normal' && c.language === 'ja',
    );
  if (
    prior.inputSha256 !== sha(input) ||
    prior.referenceSha256 !== sha(refs) ||
    items.length !== 2
  )
    throw Error('crop original context');
  const binding = await bindCandidate('qwen', config.qwen, manifest.qwen),
    codeSha = await fileHash(__filename),
    validatorSha = await fileHash(require.resolve('./review.cjs')),
    originalMethod = binding.method;
  if (
    prior.method.kind !== 'model' ||
    prior.method.id !== 'qwen-candidate-research' ||
    prior.method.modelManifestSha256 !== originalMethod.modelManifestSha256
  )
    throw Error('crop model changed');
  binding.method = {
    ...originalMethod,
    id: 'qwen-leading-crop-research',
    version: 'crop-v1',
    environmentLockSha256: sha(
      JSON.stringify([originalMethod, codeSha, validatorSha, 2000]),
    ),
  };
  fs.mkdirSync(output, { recursive: true });
  let active,
    cancelled = false;
  const results = [],
    evidence = [];
  const cancel = () => {
    cancelled = true;
    void active?.cancel();
  };
  process.once('SIGINT', cancel);
  try {
    for (const item of items) {
      const old = prior.cases.find((c) => c.id === item.id),
        sourceDir = path.join(root, 'qwen', item.id),
        side = await validateCandidate(sourceDir, item, old),
        dir = path.join(output, item.id);
      fs.mkdirSync(path.join(dir, 'lyrics'), { recursive: true });
      fs.copyFileSync(
        path.join(sourceDir, 'audio.wav'),
        path.join(dir, 'audio.wav'),
      );
      fs.copyFileSync(
        path.join(sourceDir, 'lyrics/main.vtt'),
        path.join(dir, 'lyrics/main.vtt'),
      );
      if (
        (await fileHash(path.join(dir, 'audio.wav'))) !== side.audio.sha256 ||
        cancelled
      )
        throw Error('crop copied source/cancelled');
      const windows = [];
      active = startCandidateJob({
        binding,
        trackDir: dir,
        source: researchSource('main.vtt'),
        canonical: old.canonical,
        durationMs: item.durationMs,
        language: item.language,
        jobsRoot: path.join(output, 'jobs'),
        isCurrent: () => !cancelled,
        sessionFactory: async (...args) => {
          const session = await createSession(...args),
            workspace = args[2];
          return {
            ...session,
            infer: async (request) => {
              const index = Number(request.prefix.slice(1));
              const {
                plannedWindows,
              } = require('../lyricsAlignmentCandidates/qualityRun.cjs');
              const window = plannedWindows(item, old.canonical).find(
                (w) => w.index === index,
              );
              if (
                !window ||
                request.text !==
                  old.canonical.lines
                    .filter((l) => {
                      try {
                        lexicalUnits(l.text, item.language);
                        return (
                          l.startMs >= window.startMs && l.endMs <= window.endMs
                        );
                      } catch {
                        return false;
                      }
                    })
                    .map((l) => l.text)
                    .join('\n')
              )
                throw Error('crop window request');
              const cropMs = leadingCropMs(
                  old.canonical.lines,
                  item.language,
                  window.startMs,
                  window.endMs,
                ),
                bytes = fs.readFileSync(
                  path.join(workspace, `${request.prefix}.pcm`),
                ),
                prefix = `${request.prefix}crop`;
              if (
                cropMs * 64 >= bytes.length ||
                !Number.isSafeInteger(cropMs * 64)
              )
                throw Error('crop audio bounds');
              fs.writeFileSync(
                path.join(workspace, `${prefix}.pcm`),
                bytes.subarray(cropMs * 64),
              );
              const value = await session.infer({ ...request, prefix }),
                spans = value.spans.map((s) => ({
                  ...s,
                  start: s.start + cropMs / 1000,
                  end: s.end + cropMs / 1000,
                }));
              windows.push({ ...window, cropMs, spans });
              return { ...value, spans };
            },
          };
        },
      });
      const result = await active.result;
      active = null;
      results.push({ ...old, ...result });
      evidence.push({ id: item.id, audioSha256: side.audio.sha256, windows });
      console.log(
        JSON.stringify({ id: item.id, crops: windows.map((w) => w.cropMs) }),
      );
    }
    if (
      cancelled ||
      (await fileHash(__filename)) !== codeSha ||
      (await fileHash(require.resolve('./review.cjs'))) !== validatorSha
    )
      throw Error('crop code changed/cancelled');
    await binding.assertCurrent();
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify(
        {
          method: binding.method,
          inputSha256: sha(input),
          referenceSha256: sha(refs),
          cases: results,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(output, 'summary.json'),
      JSON.stringify(
        { cases: scoreResults(items, results, JSON.parse(refs)) },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(output, 'evidence.json'),
      JSON.stringify(
        {
          codeSha256: codeSha,
          validatorSha256: validatorSha,
          originalMethod,
          method: binding.method,
          originalResultsSha256: sha(priorBytes),
          cases: evidence,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(output, 'verification.json'),
      JSON.stringify({ checks: verifyResults(results) }, null, 2),
    );
  } finally {
    process.removeListener('SIGINT', cancel);
    await active?.cancel();
  }
}
if (require.main === module)
  run(...process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { leadingCropMs, run };
