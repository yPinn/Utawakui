'use strict';
// Private research corpus: no library writes, no model downloads, no product IPC.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createServer } = require('vite');
const { sha, fileHash } = require('../lyricsAlignmentCandidates/assets.cjs');
const {
  researchSource,
  scoreResults,
} = require('../lyricsAcoustic/evaluate.cjs');
const {
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const {
  omitInteriorWord,
  replaceInterval,
  outerVtt,
  floatWav,
} = require('./cases.cjs');

async function prepare(inventoryPath, configPath, root) {
  if (!path.isAbsolute(root) || fs.existsSync(path.join(root, 'cases.json')))
    throw Error('fresh corpus required');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath));
  const config = JSON.parse(fs.readFileSync(configPath));
  fs.mkdirSync(root, { recursive: true });
  const server = await createServer({
    configFile: false,
    root: path.resolve('.'),
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  const { normalizeLyricsDocument } = await server.ssrLoadModule(
    '/src/utils/lyricsDocument.js',
  );
  await server.close();
  const cases = [],
    refs = {},
    frozen = [],
    selection = [];
  const audioHashes = new Set();
  const decode = (file, startMs, durationMs) => {
    const result = spawnSync(
      config.qwen.ffmpegPath,
      [
        '-v',
        'error',
        '-ss',
        String(startMs / 1000),
        '-i',
        file,
        '-t',
        String(durationMs / 1000),
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'f32le',
        'pipe:1',
      ],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    if (
      result.status !== 0 ||
      result.error ||
      result.stdout.length < durationMs * 64 - 6400
    )
      throw Error('research decode failed');
    return result.stdout;
  };
  for (const language of ['zh', 'ja']) {
    let selected = 0;
    const choices = inventory
      .filter((c) => c.language === language && (c.source.offsetMs ?? 0) === 0)
      .sort((a, b) => {
        const fine = (c) =>
          c.canonical.lines.filter((l) => l.segments?.length >= 3).length;
        return (
          (language === 'ja' ? fine(b) - fine(a) : 0) ||
          a.trackId.localeCompare(b.trackId)
        );
      });
    for (const candidate of choices) {
      if (selected === 2) break;
      const all = candidate.canonical.lines.map((l, i, a) => ({
        ...l,
        endMs: l.endMs ?? a[i + 1]?.startMs,
      }));
      const first = all.find(
        (l) =>
          Number.isSafeInteger(l.endMs) &&
          l.endMs > l.startMs &&
          l.text.length >= 5,
      );
      if (!first) continue;
      const startMs = Math.max(0, first.startMs - 2000),
        durationMs = 30000;
      const chosen = all.filter(
        (l) =>
          l.startMs >= startMs &&
          l.endMs <= startMs + durationMs &&
          l.endMs > l.startMs &&
          l.endMs - l.startMs <= 15000 &&
          l.text.trim().length >= 4 &&
          !/[\r\n<>]/u.test(l.text),
      );
      if (chosen.length < 3) continue;
      const target = chosen.slice(1, -1).find((l) => {
        try {
          omitInteriorWord(l.text, language);
          return true;
        } catch {
          return false;
        }
      });
      const donor = all.find(
        (l) =>
          l.startMs > startMs + durationMs &&
          Number.isSafeInteger(l.endMs) &&
          l.endMs - l.startMs >= 800 &&
          l.endMs - l.startMs <= 10000 &&
          l.text.trim().length >= 4 &&
          l.text !== target?.text,
      );
      if (!target || !donor) continue;
      const audio = path.join(candidate.dir, candidate.audio);
      const audioSha = await fileHash(audio);
      if (audioHashes.has(audioSha)) continue;
      const sourcePath = path.join(
        candidate.dir,
        'lyrics',
        candidate.source.filename,
      );
      const sourceSha = await fileHash(sourcePath);
      if (sourceSha !== candidate.canonical.source.sha256)
        throw Error('stale inventory lyrics');
      const raw = decode(audio, startMs, durationMs),
        donorRaw = decode(audio, donor.startMs, donor.endMs - donor.startMs);
      if (
        (await fileHash(audio)) !== audioSha ||
        (await fileHash(sourcePath)) !== sourceSha
      )
        throw Error('library source changed');
      selected++;
      audioHashes.add(audioSha);
      const songId = `${language}-${selected}`,
        targetIndex = chosen.indexOf(target);
      selection.push({
        songId,
        trackId: candidate.trackId,
        audioSha256: audioSha,
        sourceSha256: sourceSha,
        startMs,
        durationMs,
        targetIndex,
        donorInterval: [donor.startMs, donor.endMs],
        providerFineLines: chosen.filter((l) => l.segments?.length >= 3).length,
      });
      for (const variant of [
        'normal',
        'phrase-mismatch',
        'missing-text',
        'missing-audio',
      ]) {
        const id = `${songId}-${variant}`,
          lines = chosen.map((l) => ({
            text: l.text,
            startMs: l.startMs - startMs,
            endMs: l.endMs - startMs,
          }));
        let omission;
        if (variant === 'missing-text') {
          omission = omitInteriorWord(lines[targetIndex].text, language);
          lines[targetIndex].text = omission.text;
        }
        let samples = raw;
        if (variant === 'missing-audio' || variant === 'phrase-mismatch')
          samples = replaceInterval(
            raw,
            lines[targetIndex].startMs,
            lines[targetIndex].endMs,
            variant === 'missing-audio' ? null : donorRaw,
          );
        const dir = path.join(root, 'frozen', id);
        fs.mkdirSync(path.join(dir, 'lyrics'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'audio.wav'), floatWav(samples));
        const text = outerVtt(lines);
        fs.writeFileSync(path.join(dir, 'lyrics/main.vtt'), text);
        const source = researchSource('main.vtt'),
          context = await prepareAcousticEstimateContext(dir, source);
        const canonical = normalizeLyricsDocument({
          text,
          source,
          sourceFingerprint: context.source.sha256,
        });
        if (
          canonical.lines.length !== lines.length ||
          canonical.lines.some((l, i) => l.text !== lines[i].text)
        )
          throw Error('coarse normalization mismatch');
        for (const l of canonical.lines) delete l.segments;
        canonical.granularity = 'T1';
        const doc = createAcousticEstimate(context, canonical, new Map());
        const estimate = await saveTrackAcousticEstimate(dir, source, doc);
        const item = {
          id,
          songId,
          language,
          tier: 'new-local',
          phase: 'fresh-2026-10-19',
          variant,
          t1Kind: 'provider-coarse',
          referenceKind: 'external-provider',
          durationMs,
          offsetMs: 0,
          filename: 'main.vtt',
          audio: path.join(dir, 'audio.wav'),
          lines,
          targetIndex,
          synthetic: variant !== 'normal',
          ...(omission ? { removed: omission.removed } : {}),
        };
        cases.push(item);
        refs[id] = {};
        chosen.forEach((line, index) => {
          // Changed audio has no valid provider onset truth inside the changed phrase.
          if (
            index === targetIndex &&
            ['phrase-mismatch', 'missing-audio'].includes(variant)
          )
            return;
          let offset = 0;
          const rows = [];
          for (const s of line.segments ?? []) {
            const from =
              index === targetIndex && omission
                ? omission.mapFrom(offset)
                : offset;
            if (
              from !== null &&
              Number.isSafeInteger(s.startMs) &&
              s.startMs >= startMs &&
              s.startMs < startMs + durationMs
            )
              rows.push({ from, startMs: s.startMs - startMs });
            offset += s.text.length;
          }
          if (rows.length) refs[id][canonical.lines[index].lineId] = rows;
        });
        frozen.push({
          ...item,
          canonical,
          original: structuredClone(canonical),
          estimate,
        });
      }
    }
    if (selected !== 2) throw Error('insufficient independent songs');
  }
  const input = JSON.stringify(cases, null, 2),
    reference = JSON.stringify(refs, null, 2);
  fs.writeFileSync(path.join(root, 'cases.json'), input);
  fs.writeFileSync(path.join(root, 'references.json'), reference);
  fs.writeFileSync(
    path.join(root, 'selection.json'),
    JSON.stringify(
      {
        strategy:
          'two per language; JA prefers available external provider fine timing; stable track-id tie break; minimum 3 complete coarse lines; first interior omittable phrase; first later different phrase donor; no outcome selection',
        cases: selection,
      },
      null,
      2,
    ),
  );
  const result = {
    inputSha256: sha(input),
    referenceSha256: sha(reference),
    cases: frozen,
  };
  fs.writeFileSync(
    path.join(root, 'frozen/results.json'),
    JSON.stringify(result, null, 2),
  );
  fs.writeFileSync(
    path.join(root, 'frozen/summary.json'),
    JSON.stringify(
      { ...result, cases: scoreResults(cases, frozen, refs) },
      null,
      2,
    ),
  );
  config.small.rawEvidenceRoot = path.join(
    config.small.root,
    `raw-fresh-${path.basename(root)}`,
  );
  fs.writeFileSync(
    path.join(root, 'config.json'),
    JSON.stringify(config, null, 2),
  );
  console.log(
    JSON.stringify({
      songs: selection.length,
      cases: cases.length,
      selection: selection.map(({ songId, providerFineLines }) => ({
        songId,
        providerFineLines,
      })),
    }),
  );
}
if (require.main === module)
  prepare(...process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { prepare };
