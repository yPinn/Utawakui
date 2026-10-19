'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { sha, fileHash } = require('../lyricsAlignmentCandidates/assets.cjs');
const { loadFresh } = require('./completenessReplay.cjs');
const { validateLabels, summarizeHuman } = require('./review.cjs');
function scoreReviewedSamples(entries, samples) {
  const selected = entries.filter(
    (e) =>
      e.status === 'reviewed' &&
      e.content !== 'uncertain' &&
      samples.some((s) => s.sampleId === e.sampleId),
  );
  const methods = {};
  for (const name of Object.keys(samples[0]?.proposals ?? {})) {
    const score = {
      mismatch: 0,
      falseAccept: 0,
      exactBaseReady: 0,
      falseReject: 0,
      markedCuts: 0,
      missingCuts: 0,
      within100: 0,
      over500: 0,
      over1000: 0,
    };
    for (const e of selected) {
      const s = samples.find((s) => s.sampleId === e.sampleId),
        p = s.proposals[name],
        base = s.proposals[name.startsWith('qwen') ? 'qwen' : 'hubertfa'];
      if (['different-content', 'unperformed-lyrics'].includes(e.content)) {
        score.mismatch++;
        if (p.ready) score.falseAccept++;
        continue;
      }
      if (e.content === 'exact' && base?.ready) {
        score.exactBaseReady++;
        if (!p.ready) score.falseReject++;
      }
      for (const o of e.onsets.filter((o) => o.timeMs !== null)) {
        score.markedCuts++;
        const onset = p.chunks.find((c) => c.from === o.from)?.startMs;
        if (onset === undefined) {
          score.missingCuts++;
          continue;
        }
        const error = Math.abs(onset - o.timeMs);
        if (error <= 100) score.within100++;
        if (error > 500) score.over500++;
        if (error > 1000) score.over1000++;
      }
    }
    methods[name] = score;
  }
  return {
    reviewed: selected.length,
    methods,
    completeness: {
      missingTextReviewed: selected.filter(
        (e) => e.content === 'missing-displayed-lyrics',
      ).length,
      missingTextWarned: selected.filter(
        (e) =>
          e.content === 'missing-displayed-lyrics' &&
          samples.find((s) => s.sampleId === e.sampleId).completeness ===
            'possible-missing-text',
      ).length,
      exactReviewed: selected.filter((e) => e.content === 'exact').length,
      exactWarned: selected.filter(
        (e) =>
          e.content === 'exact' &&
          samples.find((s) => s.sampleId === e.sampleId).completeness ===
            'possible-missing-text',
      ).length,
    },
  };
}
async function importReview(root, packetDir, labelsFile, output) {
  if (!path.isAbsolute(output) || fs.existsSync(output))
    throw Error('new absolute review output required');
  const { comparison } = await loadFresh(root);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(packetDir, 'receipt.json')),
  );
  if (
    receipt.packetId !== comparison.humanManifestSha256 ||
    (await fileHash(require.resolve('./listeningPage.cjs'))) !==
      receipt.sourceHashes.generator
  )
    throw Error('review packet producer mismatch');
  for (const [file, expected] of Object.entries(receipt.files)) {
    if (
      !/^(?:index\.html|listening\.css|listeningApp\.js|packet-data\.js|packet\.json|audio\/[a-f0-9]{64}\.wav)$/.test(
        file,
      ) ||
      (await fileHash(path.join(packetDir, file))) !== expected
    )
      throw Error('review packet asset changed');
  }
  if (fs.statSync(labelsFile).size > 2097152)
    throw Error('review labels budget');
  const bytes = fs.readFileSync(labelsFile),
    labels = JSON.parse(bytes),
    packet = JSON.parse(fs.readFileSync(path.join(packetDir, 'packet.json')));
  if (
    packet.packetId !== receipt.packetId ||
    packet.manifest.corpusSha256 !== comparison.inputSha256
  )
    throw Error('review packet corpus changed');
  validateLabels(labels, packet.manifest);
  const result = {
    schemaVersion: 1,
    scope: 'selected risk-directed samples; no population error-rate claim',
    human: summarizeHuman(labels.entries),
    selected: scoreReviewedSamples(labels.entries, packet.samples),
    labelsSha256: sha(bytes),
    packetSha256: receipt.files['packet.json'],
    rawResultsSha256: comparison.rawResultsSha256,
    validatorSha256: await fileHash(__filename),
    identityNote:
      'reviewer IDs are self-reported, not independently authenticated',
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(
    JSON.stringify({
      human: result.human,
      selectedReviewed: result.selected.reviewed,
    }),
  );
  return result;
}
if (require.main === module)
  importReview(...process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { scoreReviewedSamples, importReview };
