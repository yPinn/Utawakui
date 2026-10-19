'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { isDeepStrictEqual } = require('node:util');
const { sha, fileHash } = require('../lyricsAlignmentCandidates/assets.cjs');
const { loadFresh } = require('./completenessReplay.cjs');
const { applyContentMask } = require('./hubertComparison.cjs');
const { validateLabels, validateKey } = require('./review.cjs');
const methods = ['qwen', 'hubertfa', 'qwen-small-fold', 'hubertfa-small-fold'];
function scriptJSON(value) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
function buildPageData(manifest, labels, selected, items, candidates) {
  if (new Set(selected.map((p) => p.sampleId)).size !== selected.length)
    throw Error('listening duplicate sample');
  const samples = selected.map((p) => {
    const sample = manifest.samples.find((s) => s.sampleId === p.sampleId),
      caseIndex = items.findIndex((i) => i.id === p.caseId);
    if (
      !sample ||
      caseIndex < 0 ||
      !/^r-\d{3}$/.test(p.sampleId) ||
      !/^[a-f0-9]{64}$/.test(sample.audioSha256)
    )
      throw Error('listening sample identity');
    const proposals = {};
    for (const method of methods) {
      const result = candidates[method][caseIndex],
        canonical = result?.canonical.lines[p.lineIndex],
        line = result?.estimate.preview.lines[p.lineIndex];
      if (canonical?.text !== sample.text || !line)
        throw Error('listening proposal identity');
      proposals[method] = {
        ready: line.status === 'ready',
        chunks: structuredClone(line.chunks),
      };
    }
    return {
      sampleId: sample.sampleId,
      language: sample.language,
      text: sample.text,
      cuts: sample.cuts,
      startMs: sample.startMs,
      endMs: sample.endMs,
      durationMs: sample.durationMs,
      audio: `audio/${sample.audioSha256}.wav`,
      audioSha256: sample.audioSha256,
      group: p.group ?? 'priority',
      reason: p.reason,
      proposals,
    };
  });
  return {
    schemaVersion: 1,
    manifest: {
      corpusSha256: manifest.corpusSha256,
      samples: manifest.samples.map(({ sampleId, cuts, durationMs }) => ({
        sampleId,
        cuts,
        durationMs,
      })),
    },
    labels: structuredClone(labels),
    samples,
  };
}
async function build(root, output, completenessFile) {
  if (!path.isAbsolute(output) || fs.existsSync(output))
    throw Error('new absolute listening output required');
  const { comparison, items, candidates } = await loadFresh(root);
  const manifestBytes = fs.readFileSync(
    path.join(root, 'human-review/manifest.json'),
  );
  if (sha(manifestBytes) !== comparison.humanManifestSha256)
    throw Error('listening manifest changed');
  const manifest = JSON.parse(manifestBytes),
    labelsBytes = fs.readFileSync(path.join(root, 'human-review/labels.json'));
  const labels = JSON.parse(labelsBytes),
    key = JSON.parse(fs.readFileSync(path.join(root, 'review-key.json')));
  if (key.manifestSha256 !== sha(manifestBytes))
    throw Error('listening key receipt');
  validateKey(manifest, key);
  validateLabels(labels, manifest);
  const completenessBytes = fs.readFileSync(completenessFile),
    completeness = JSON.parse(completenessBytes);
  if (
    completeness.inputSha256 !== comparison.inputSha256 ||
    completeness.referenceSha256 !== comparison.referenceSha256 ||
    !isDeepStrictEqual(
      completeness.rawResultsSha256,
      comparison.rawResultsSha256,
    )
  )
    throw Error('listening completeness identity');
  const mask = completeness.results['script-fold'].stats;
  const modelCases = {
    qwen: candidates.qwen.cases,
    hubertfa: candidates.hubertfa.cases,
    'qwen-small-fold': applyContentMask(candidates.qwen.cases, mask),
    'hubertfa-small-fold': applyContentMask(candidates.hubertfa.cases, mask),
  };
  const selected = comparison.priority.map((p) => ({
    ...p,
    group: 'priority',
  }));
  for (const item of items.filter((i) => i.variant === 'missing-text')) {
    const row = key.rows.find(
      (k) => k.caseId === item.id && k.lineIndex === item.targetIndex,
    );
    if (!row) throw Error('missing text review sample');
    if (!selected.some((p) => p.sampleId === row.sampleId))
      selected.push({
        ...row,
        group: 'missing-text',
        reason: '補充：獨立聽判歌詞是否漏字；包含一個原配方不支援的英文目標。',
      });
  }
  if (
    selected.some(
      (p) => (items.find((i) => i.id === p.caseId).offsetMs ?? 0) !== 0,
    )
  )
    throw Error('listening v1 requires zero-offset packet');
  const data = buildPageData(manifest, labels, selected, items, modelCases);
  data.packetId = sha(manifestBytes);
  data.primaryCount = comparison.priority.length;
  data.completenessSha256 = sha(completenessBytes);
  data.samples.forEach((s, i) => {
    s.completeness = mask.find((c) => c.id === selected[i].caseId).decisions[
      selected[i].lineIndex
    ].insertionState;
  });
  const source = ['listening.html', 'listening.css', 'listeningApp.js'];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      source.map(async (name) => [
        name,
        await fileHash(path.join(__dirname, name)),
      ]),
    ),
  );
  fs.mkdirSync(path.join(output, 'audio'), { recursive: true });
  for (const sample of data.samples) {
    const original = manifest.samples.find(
      (s) => s.sampleId === sample.sampleId,
    );
    if (!/^audio\/r-\d{3}\.wav$/.test(original.audio))
      throw Error('listening source audio path');
    const audio = path.join(root, 'human-review', original.audio),
      target = path.join(output, sample.audio);
    if ((await fileHash(audio)) !== sample.audioSha256)
      throw Error('listening audio changed');
    if (!fs.existsSync(target))
      fs.copyFileSync(audio, target, fs.constants.COPYFILE_EXCL);
    if ((await fileHash(target)) !== sample.audioSha256)
      throw Error('listening copy changed');
  }
  for (const name of source) {
    if ((await fileHash(path.join(__dirname, name))) !== sourceHashes[name])
      throw Error('listening source changed');
    fs.copyFileSync(
      path.join(__dirname, name),
      path.join(output, name === 'listening.html' ? 'index.html' : name),
      fs.constants.COPYFILE_EXCL,
    );
  }
  const decisions = [
    'exact',
    'missing-displayed-lyrics',
    'unperformed-lyrics',
    'different-content',
    'uncertain',
  ];
  fs.writeFileSync(
    path.join(output, 'packet-data.js'),
    `'use strict';\nwindow.LISTENING_PACKET=${scriptJSON(data)};\nwindow.validateListeningLabels=(()=>{const decisions=${scriptJSON(decisions)};return ${validateLabels.toString()};})();\n`,
    { flag: 'wx' },
  );
  fs.writeFileSync(
    path.join(output, 'packet.json'),
    JSON.stringify(data, null, 2),
    { flag: 'wx' },
  );
  const files = [
    'index.html',
    'listening.css',
    'listeningApp.js',
    'packet-data.js',
    'packet.json',
    ...new Set(data.samples.map((s) => s.audio)),
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (name) => [
        name,
        await fileHash(path.join(output, name)),
      ]),
    ),
  );
  fs.writeFileSync(
    path.join(output, 'receipt.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        packetId: data.packetId,
        labelsSha256: sha(labelsBytes),
        completenessSha256: sha(completenessBytes),
        primary: comparison.priority.length,
        supplemental: data.samples.length - comparison.priority.length,
        sourceHashes: {
          ...sourceHashes,
          generator: await fileHash(__filename),
          validator: await fileHash(require.resolve('./review.cjs')),
        },
        files: hashes,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      output,
      primary: data.primaryCount,
      supplemental: data.samples.length - data.primaryCount,
      originalLabelsUnchanged:
        (await fileHash(path.join(root, 'human-review/labels.json'))) ===
        sha(labelsBytes),
    }),
  );
}
function createListeningServer(assets) {
  return http.createServer((request, response) => {
    const address = response.socket.localPort;
    if (request.headers.host !== `127.0.0.1:${address}`) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const asset = assets.get(request.url);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    try {
      const stat = fs.lstatSync(asset.file);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw Error('listening asset unavailable');
      let start = 0,
        end = stat.size - 1,
        status = 200;
      if (request.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if (
          !match ||
          !Number.isSafeInteger(Number(match[1])) ||
          Number(match[1]) >= stat.size ||
          (match[2] &&
            (!Number.isSafeInteger(Number(match[2])) ||
              Number(match[2]) < Number(match[1])))
        ) {
          response
            .writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
            .end();
          return;
        }
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
        status = 206;
        response.setHeader(
          'Content-Range',
          `bytes ${start}-${end}/${stat.size}`,
        );
      }
      response.writeHead(status, {
        'Content-Type': asset.type,
        'Content-Length': Math.max(0, end - start + 1),
        'Accept-Ranges': 'bytes',
      });
      if (request.method === 'HEAD' || stat.size === 0) {
        response.end();
        return;
      }
      const stream = fs.createReadStream(asset.file, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(410);
      response.end();
    }
  });
}
async function serve(directory, port = 18743) {
  const receipt = JSON.parse(
      fs.readFileSync(path.join(directory, 'receipt.json')),
    ),
    assets = new Map();
  for (const [name, hash] of Object.entries(receipt.files)) {
    if (
      !/^(?:index\.html|listening\.css|listeningApp\.js|packet-data\.js|packet\.json|audio\/[a-f0-9]{64}\.wav)$/.test(
        name,
      )
    )
      throw Error('listening asset allowlist');
    const file = path.join(directory, name);
    if (fs.lstatSync(file).isSymbolicLink() || (await fileHash(file)) !== hash)
      throw Error('listening packet changed');
    const type = name.endsWith('.wav')
      ? 'audio/wav'
      : name.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : name.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : name.endsWith('.json')
            ? 'application/json'
            : 'text/html; charset=utf-8';
    assets.set(name === 'index.html' ? '/' : `/${name}`, { file, type });
  }
  if (!assets.has('/')) throw Error('listening index missing');
  const server = createListeningServer(assets);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), '127.0.0.1', resolve);
  });
  console.log(`http://127.0.0.1:${server.address().port}/`);
  return server;
}
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  (command === 'build'
    ? build(...args)
    : command === 'serve'
      ? serve(...args)
      : Promise.reject(Error('build or serve required'))
  ).catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  });
}
module.exports = {
  scriptJSON,
  buildPageData,
  build,
  serve,
  createListeningServer,
};
