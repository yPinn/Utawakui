'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { fileHash, bindCandidate, sha } = require('./assets.cjs');
const { startCandidateJob } = require('./job.cjs');
const {
  scoreResults,
  researchSource,
} = require('../lyricsAcoustic/evaluate.cjs');
async function evaluate(
  configFile,
  kind,
  casesFile,
  referencesFile,
  baselineRoot,
  outputRoot,
) {
  const config = JSON.parse(fs.readFileSync(configFile)),
    manifest = JSON.parse(fs.readFileSync(config.manifest));
  if (!path.isAbsolute(outputRoot) || fs.existsSync(outputRoot))
    throw Error('new absolute candidate output required');
  const binding = await bindCandidate(kind, config[kind], manifest[kind]);
  const inputBytes = fs.readFileSync(casesFile),
    referenceBytes =
      referencesFile === '-' ? null : fs.readFileSync(referencesFile);
  if (inputBytes.length > 2097152 || (referenceBytes?.length ?? 0) > 2097152)
    throw Error('candidate manifest bytes');
  const inputSha256 = sha(inputBytes),
    referenceSha256 = referenceBytes ? sha(referenceBytes) : null;
  const items = JSON.parse(inputBytes),
    baseline = JSON.parse(
      fs.readFileSync(path.join(baselineRoot, 'results.json')),
    );
  if (
    baseline.inputSha256 !== inputSha256 ||
    JSON.parse(fs.readFileSync(path.join(baselineRoot, 'summary.json')))
      .referenceSha256 !== referenceSha256 ||
    items.length !== baseline.cases.length
  )
    throw Error('frozen evaluation identity');
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
      if (cancelled) throw Error('candidate evaluation cancelled');
      const item = items[index],
        frozen = baseline.cases[index];
      if (item.id !== frozen.id || !/^[a-z0-9-]{1,100}$/i.test(item.id))
        throw Error('candidate case identity');
      const trackDir = path.join(outputRoot, item.id);
      fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
      const old = path.join(baselineRoot, item.id),
        audio = fs
          .readdirSync(old)
          .find((n) => /^audio\.(wav|webm|mp3|flac|m4a|ogg|opus)$/.test(n));
      if (!audio) throw Error('frozen audio missing');
      const frozenSidecar = JSON.parse(
        fs.readFileSync(
          path.join(
            old,
            'lyrics/acoustic-estimates',
            `${item.filename ?? 'main.vtt'}.json`,
          ),
        ),
      );
      if (
        (await fileHash(path.join(old, audio))) !== frozenSidecar.audio.sha256
      )
        throw Error('frozen audio changed');
      fs.copyFileSync(path.join(old, audio), path.join(trackDir, audio));
      const filename = item.filename ?? 'main.vtt';
      fs.copyFileSync(
        path.join(old, 'lyrics', filename),
        path.join(trackDir, 'lyrics', filename),
      );
      if (cancelled) throw Error('candidate evaluation cancelled');
      active = startCandidateJob({
        binding,
        trackDir,
        source: researchSource(filename, item.offsetMs ?? 0),
        canonical: frozen.canonical,
        durationMs: item.durationMs,
        language: item.language,
        jobsRoot: path.join(outputRoot, 'jobs'),
        onProgress: (e) =>
          process.stdout.write(
            JSON.stringify({ caseId: item.id, ...e }) + '\n',
          ),
      });
      const result = await active.result;
      active = null;
      results.push({
        ...frozen,
        estimate: result.estimate,
        metrics: result.metrics,
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
      process.stdout.write(
        JSON.stringify({
          caseId: item.id,
          completed: results.length,
          seconds: result.metrics.seconds,
          ready: result.estimate.preview.lines.filter(
            (l) => l.status === 'ready',
          ).length,
        }) + '\n',
      );
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    await active?.cancel();
  }
  const scored = scoreResults(
    items,
    results,
    referenceBytes ? JSON.parse(referenceBytes) : {},
  );
  const summary = {
    method: binding.method,
    inputSha256,
    referenceSha256,
    evaluatorSha256: await fileHash(
      require.resolve('../lyricsAcoustic/evaluate.cjs'),
    ),
    cases: scored,
  };
  fs.writeFileSync(
    path.join(outputRoot, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  return summary;
}
if (require.main === module)
  evaluate(...process.argv.slice(2)).then(
    (s) => console.log(JSON.stringify({ completed: s.cases.length })),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
module.exports = { evaluate };
