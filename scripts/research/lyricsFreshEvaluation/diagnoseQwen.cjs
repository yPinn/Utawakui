'use strict';
// Capture upstream spans without changing the candidate worker or its mapping.
const fs = require('node:fs');
const path = require('node:path');
const {
  bindCandidate,
  fileHash,
  sha,
} = require('../lyricsAlignmentCandidates/assets.cjs');
const {
  startCandidateJob,
  createSession,
} = require('../lyricsAlignmentCandidates/job.cjs');
const { validateCandidate } = require('./review.cjs');
const {
  scoreResults,
  researchSource,
} = require('../lyricsAcoustic/evaluate.cjs');
const { verifyResults } = require('../lyricsAcoustic/verify.cjs');
async function capture(root, output) {
  if (
    !path.isAbsolute(root) ||
    !path.isAbsolute(output) ||
    fs.existsSync(output)
  )
    throw Error('new absolute diagnosis output');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'))),
    manifest = JSON.parse(fs.readFileSync(config.manifest));
  const input = fs.readFileSync(path.join(root, 'cases.json')),
    reference = fs.readFileSync(path.join(root, 'references.json')),
    priorBytes = fs.readFileSync(path.join(root, 'qwen/results.json')),
    prior = JSON.parse(priorBytes),
    items = JSON.parse(input).filter((c) => c.variant === 'normal');
  if (
    prior.inputSha256 !== sha(input) ||
    prior.referenceSha256 !== sha(reference)
  )
    throw Error('diagnosis input identity');
  const binding = await bindCandidate('qwen', config.qwen, manifest.qwen),
    codeSha256 = await fileHash(__filename),
    results = [],
    evidence = [];
  if (binding.method.modelManifestSha256 !== prior.method.modelManifestSha256)
    throw Error('diagnosis model changed');
  let active,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    void active?.cancel();
  };
  process.once('SIGINT', cancel);
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const item of items) {
      if (cancelled || (await fileHash(__filename)) !== codeSha256)
        throw Error('diagnosis changed/cancelled');
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
      if ((await fileHash(path.join(dir, 'audio.wav'))) !== side.audio.sha256)
        throw Error('diagnosis copied audio');
      const windows = [];
      active = startCandidateJob({
        binding,
        trackDir: dir,
        source: researchSource('main.vtt'),
        canonical: old.canonical,
        durationMs: item.durationMs,
        language: item.language,
        jobsRoot: path.join(output, 'jobs'),
        sessionFactory: async (...args) => {
          const session = await createSession(...args);
          return {
            ...session,
            infer: async (request) => {
              const value = await session.infer(request);
              windows.push({ request, spans: value.spans });
              return value;
            },
          };
        },
      });
      const result = await active.result;
      active = null;
      const equal =
        JSON.stringify(old.estimate.preview.lines) ===
        JSON.stringify(result.estimate.preview.lines);
      results.push({ ...old, ...result });
      evidence.push({
        id: item.id,
        audioSha256: side.audio.sha256,
        canonicalSha256: sha(JSON.stringify(old.canonical)),
        originalPredictionReproduced: equal,
        windows,
      });
      fs.writeFileSync(
        path.join(output, 'evidence.json'),
        JSON.stringify(
          {
            method: binding.method,
            inputSha256: sha(input),
            referenceSha256: sha(reference),
            priorResultsSha256: sha(priorBytes),
            codeSha256,
            cases: evidence,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify({ id: item.id, reproduced: equal }));
    }
    await binding.assertCurrent();
    if (cancelled || (await fileHash(__filename)) !== codeSha256)
      throw Error('diagnosis publication cancelled');
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify(
        {
          method: binding.method,
          inputSha256: sha(input),
          referenceSha256: sha(reference),
          cases: results,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(output, 'summary.json'),
      JSON.stringify(
        { cases: scoreResults(items, results, JSON.parse(reference)) },
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
  capture(...process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { capture };
