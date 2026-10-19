'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const {
  sha,
  fileHash,
  bindCandidate,
} = require('../lyricsAlignmentCandidates/assets.cjs');
const {
  plannedWindows,
  readAsrWindow,
  validateFrozenCases,
} = require('../lyricsAlignmentCandidates/qualityRun.cjs');
const { scoreResults } = require('../lyricsAcoustic/evaluate.cjs');
const { verifyResults } = require('../lyricsAcoustic/verify.cjs');
const {
  acousticEstimatePath,
  loadTrackAcousticEstimate,
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const { checkContent, contentRules } = require('./content.cjs');

async function compare(root) {
  if (!path.isAbsolute(root) || fs.existsSync(path.join(root, 'qwen-small')))
    throw Error('new comparison root required');
  const read = (f) => {
    if (fs.statSync(f).size > 16777216) throw Error('comparison file budget');
    return fs.readFileSync(f);
  };
  const bytes = read(path.join(root, 'cases.json')),
    refbytes = read(path.join(root, 'references.json')),
    qbytes = read(path.join(root, 'qwen/results.json')),
    sbytes = read(path.join(root, 'small/results.json'));
  const items = JSON.parse(bytes),
    references = JSON.parse(refbytes),
    qwen = JSON.parse(qbytes),
    small = JSON.parse(sbytes),
    config = JSON.parse(read(path.join(root, 'config.json'))),
    manifest = JSON.parse(read(config.manifest));
  if (qwen.inputSha256 !== sha(bytes) || qwen.referenceSha256 !== sha(refbytes))
    throw Error('comparison frozen inputs');
  validateFrozenCases(items, qwen, { small });
  const bindings = {
    qwen: await bindCandidate('qwen', config.qwen, manifest.qwen),
    small: await bindCandidate('small', config.small, manifest.small),
  };
  const codeFiles = [__filename, require.resolve('./content.cjs')],
    codeHashes = await Promise.all(codeFiles.map(fileHash));
  const seed = sha(
    JSON.stringify([sha(qbytes), sha(sbytes), contentRules, codeHashes]),
  );
  const method = {
    ...bindings.qwen.method,
    id: 'qwen-small-content-research',
    version: 'fresh-v1',
    modelManifestSha256: sha(
      JSON.stringify([
        bindings.qwen.method.modelManifestSha256,
        bindings.small.method.modelManifestSha256,
      ]),
    ),
    environmentLockSha256: seed,
  };
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  process.once('SIGINT', cancel);
  const check = async () => {
    if (cancelled) throw Error('comparison cancelled');
    for (let i = 0; i < codeFiles.length; i++)
      if ((await fileHash(codeFiles[i])) !== codeHashes[i])
        throw Error('comparison code changed');
  };
  const results = [],
    evidence = [];
  try {
    for (let index = 0; index < items.length; index++) {
      await check();
      const item = items[index],
        old = qwen.cases[index],
        asr = small.cases[index],
        canonical = old.canonical,
        source = {
          filename: canonical.source.filename,
          kind: 'manual',
          offsetMs: item.offsetMs ?? 0,
        };
      const qdir = path.join(root, 'qwen', item.id),
        sdir = path.join(root, 'small', item.id),
        qside = JSON.parse(read(acousticEstimatePath(qdir, source.filename))),
        sside = JSON.parse(read(acousticEstimatePath(sdir, source.filename)));
      for (const [dir, prior, side] of [
        [qdir, old, qside],
        [sdir, asr, sside],
      ]) {
        const bound = dir === qdir ? bindings.qwen : bindings.small;
        if (
          side.method.modelManifestSha256 !==
            bound.method.modelManifestSha256 ||
          qside.audio.sha256 !== side.audio.sha256 ||
          JSON.stringify(
            await loadTrackAcousticEstimate(dir, source, {
              method: side.method,
            }),
          ) !== JSON.stringify(prior.estimate) ||
          (await fileHash(path.join(dir, 'audio.wav'))) !== side.audio.sha256 ||
          (await fileHash(path.join(dir, 'lyrics', source.filename))) !==
            canonical.source.sha256
        )
          throw Error('comparison source context');
      }
      const planned = plannedWindows(item, canonical),
        windows = [];
      for (const w of planned) {
        const recorded = asr.metrics.windows.find((v) => v.index === w.index);
        if (!recorded) {
          windows.push({ ...w, spans: [], missingAsr: true });
          continue;
        }
        const durationMs = recorded.decodedDurationMs ?? w.endMs - w.startMs;
        const raw = readAsrWindow(
          config.small,
          'small',
          { method: small.method, metrics: asr.metrics },
          bindings.small.method,
          planned,
          w,
          item.language,
          durationMs,
        );
        windows.push({ ...w, durationMs, ...raw });
      }
      const stats = [],
        chunks = canonical.lines.map((line, i) => {
          const w = windows.find((w) => w.lineIds.includes(line.lineId)),
            qline = old.estimate.preview.lines[i];
          if (
            ['lineId', 'text', 'startMs', 'endMs'].some(
              (k) => qline[k] !== line[k],
            )
          )
            throw Error('comparison line context');
          const r =
            w && !w.missingAsr
              ? checkContent(line, {
                  language: item.language,
                  windowStartMs: w.startMs,
                  offsetMs: item.offsetMs ?? 0,
                  durationMs: w.durationMs,
                  spans: w.spans,
                })
              : { reject: false, missingAsr: true };
          stats.push({ lineId: line.lineId, ...r });
          return r.reject ? undefined : qline.chunks;
        });
      const dir = path.join(root, 'qwen-small', item.id);
      fs.mkdirSync(path.join(dir, 'lyrics'), { recursive: true });
      fs.copyFileSync(
        path.join(qdir, 'audio.wav'),
        path.join(dir, 'audio.wav'),
      );
      fs.copyFileSync(
        path.join(qdir, 'lyrics', source.filename),
        path.join(dir, 'lyrics', source.filename),
      );
      const context = await prepareAcousticEstimateContext(dir, source, {
        method,
      });
      if (
        context.audio.sha256 !== qside.audio.sha256 ||
        context.source.sha256 !== canonical.source.sha256 ||
        context.source.timingSha256 !== qside.source.timingSha256 ||
        context.source.offsetUsedMs !== qside.source.offsetUsedMs
      )
        throw Error('comparison copied context');
      await check();
      const document = createAcousticEstimate(context, canonical, chunks),
        estimate = await saveTrackAcousticEstimate(dir, source, document, {
          method,
          isCurrent: () => !cancelled,
        });
      results.push({
        ...old,
        estimate,
        metrics: { ...old.metrics, content: stats, remainingOwnedPids: [] },
      });
      evidence.push({ id: item.id, windows, stats });
    }
    await bindings.qwen.assertCurrent();
    await bindings.small.assertCurrent();
    await check();
    const write = (name, value) =>
      fs.writeFileSync(
        path.join(root, 'qwen-small', name),
        JSON.stringify(value, null, 2),
      );
    write('results.json', {
      method,
      inputSha256: sha(bytes),
      referenceSha256: sha(refbytes),
      cases: results,
    });
    write('summary.json', {
      method,
      inputSha256: sha(bytes),
      referenceSha256: sha(refbytes),
      rules: contentRules,
      cases: scoreResults(items, results, references),
    });
    write('evidence.json', { seed, codeHashes, cases: evidence });
    write('verification.json', { checks: verifyResults(results) });
    console.log(
      JSON.stringify({
        cases: results.length,
        rejectedLines: evidence.flatMap((c) => c.stats).filter((s) => s.reject)
          .length,
      }),
    );
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
if (require.main === module)
  compare(process.argv[2]).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { compare };
