'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractArtifact } = require('../lyricsAcoustic/artifacts');
const { contained, fingerprintTree } = require('../lyricsAcoustic/integrity');
const { downloadPinned } = require('./download');
const pins = require('../../../scripts/research/lyricsFreshEvaluation/trial-assets.json');
const installedPins = require('./installed-pins.json');

function researchPaths(root, ffmpegPath) {
  return {
    modelDir: path.join(root, 'models/hubertfa/1218_hfa_model_new_dict'),
    vendorDir: path.join(root, 'vendor/hubertfa'),
    pythonPath: path.join(root, 'runtime/python.exe'),
    environmentPath: path.join(root, 'environment'),
    ffmpegPath,
    whisperPath: path.join(root, 'vendor/whisper/Release/whisper-cli.exe'),
    modelPath: path.join(root, 'models/ggml-small.bin'),
  };
}
async function verifyInstalled(root, signal) {
  for (const [name, digest] of Object.entries(installedPins)) {
    signal?.throwIfAborted();
    if (
      (await fingerprintTree(
        contained(root, path.join(root, name)),
        signal,
      )) !== digest
    )
      throw Error('research installation integrity failed');
  }
}
function createResearchEnvironment({
  root,
  getFfmpegPath,
  probe,
  download = downloadPinned,
  extract = extractArtifact,
}) {
  if (!path.isAbsolute(root)) throw Error('research root must be absolute');
  function ensureRoot() {
    if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink())
      throw Error('research root link');
    fs.mkdirSync(root, { recursive: true });
  }
  function installed() {
    ensureRoot();
    return contained(root, path.join(root, 'installed'));
  }
  async function verifyAt(directory, options) {
    const ffmpegPath = getFfmpegPath();
    if (!ffmpegPath) throw Error('FFmpeg preparation required');
    await verifyInstalled(directory, options.signal);
    const config = researchPaths(directory, ffmpegPath);
    await require('../../../scripts/research/lyricsAcoustic/assets.cjs').verifyAssets(
      config,
    );
    options.signal.throwIfAborted();
    await probe(config, options);
    options.signal.throwIfAborted();
  }
  return {
    exists: () => fs.existsSync(installed()),
    paths: () => researchPaths(installed(), getFfmpegPath()),
    async prepare(options) {
      ensureRoot();
      if (!getFfmpegPath()) throw Error('FFmpeg preparation required');
      // Recover only our fixed staging directories left by a terminated process.
      for (const name of fs.readdirSync(root)) {
        if (/^stage-[a-f0-9-]{36}$/.test(name))
          fs.rmSync(contained(root, path.join(root, name)), {
            recursive: true,
            force: true,
          });
      }
      const stage = contained(
        root,
        path.join(root, `stage-${crypto.randomUUID()}`),
      );
      const destination = installed();
      const previous = contained(root, path.join(root, 'previous'));
      if (fs.existsSync(previous)) {
        if (!fs.existsSync(destination)) fs.renameSync(previous, destination);
        else fs.rmSync(previous, { recursive: true, force: true });
      }
      fs.mkdirSync(stage);
      const downloads = path.join(stage, 'downloads');
      const assets = path.join(stage, 'assets');
      fs.mkdirSync(downloads);
      fs.mkdirSync(assets);
      try {
        for (const artifact of pins.artifacts) {
          options.signal.throwIfAborted();
          options.onProgress(`download:${artifact.filename}`);
          await download(
            artifact,
            path.join(downloads, artifact.filename),
            options,
          );
        }
        async function unpack(filename, target) {
          options.onProgress('extract');
          await extract(
            fs.readFileSync(path.join(downloads, filename)),
            path.join(assets, target),
            {
              ...pins.artifacts.find((a) => a.filename === filename),
              maxExtractedBytes: 1024 ** 3,
            },
            options,
          );
        }
        await unpack('python-3.14.7-embed-amd64.zip', 'runtime');
        await unpack('numpy-2.5.2-cp314-cp314-win_amd64.whl', 'environment');
        await unpack('pypinyin-0.55.0-py2.py3-none-any.whl', 'environment');
        await unpack('1218_hfa_model_new_dict.zip', 'models/hubertfa');
        await unpack('whisper-bin-x64.zip', 'vendor/whisper');
        const vendor = path.join(assets, 'vendor/hubertfa/tools');
        fs.mkdirSync(vendor, { recursive: true });
        for (const name of ['decoder', 'align_word']) {
          let source = fs
            .readFileSync(path.join(downloads, `hubertfa-${name}.py`), 'utf8')
            .replace(/\r\n/g, '\n');
          if (name === 'decoder') {
            const optional =
              'from tools.plot import plot_force_alignment_prob, plot_non_lexical_phonemes\n';
            if (source.split(optional).length !== 2)
              throw Error('research vendor patch mismatch');
            source = source.replace(optional, '\n');
          }
          fs.writeFileSync(path.join(vendor, `${name}.py`), source);
        }
        fs.copyFileSync(
          path.join(downloads, 'ggml-small.bin'),
          path.join(assets, 'models/ggml-small.bin'),
        );
        fs.mkdirSync(path.join(assets, 'notices'));
        fs.copyFileSync(
          path.join(downloads, 'hubertfa-source-LICENSE.txt'),
          path.join(assets, 'notices/hubertfa-source-LICENSE.txt'),
        );
        options.onProgress('verify');
        await verifyAt(assets, options);
        options.signal.throwIfAborted();
        // Preserve the previous working install until the replacement has loaded.

        if (fs.existsSync(destination)) fs.renameSync(destination, previous);
        try {
          fs.renameSync(assets, destination);
        } catch (error) {
          if (fs.existsSync(previous)) fs.renameSync(previous, destination);
          throw error;
        }
        fs.rmSync(previous, { recursive: true, force: true });
      } finally {
        fs.rmSync(contained(root, stage), { recursive: true, force: true });
      }
    },
    verify: (options) => verifyAt(installed(), options),
    async remove({ signal }) {
      signal.throwIfAborted();
      ensureRoot();
      for (const name of fs.readdirSync(root)) {
        if (
          ['installed', 'previous', 'jobs'].includes(name) ||
          /^stage-[a-f0-9-]{36}$/.test(name)
        ) {
          signal.throwIfAborted();
          fs.rmSync(contained(root, path.join(root, name)), {
            recursive: true,
            force: true,
          });
        }
      }
    },
  };
}
module.exports = { createResearchEnvironment, researchPaths, verifyInstalled };
