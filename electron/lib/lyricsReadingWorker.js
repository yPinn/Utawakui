'use strict';

// Runs buildReadingDoc()/buildRomanizationDoc() off the main thread, mirroring
// vocalSeparationWorker.js. Building the kuromoji tokenizer loads the IPADIC
// dictionary (CPU/memory heavy, ~1-3s), which must never happen on the main
// process or at startup.
//
// Messages are `type`-discriminated: zero or more 'progress', then one
// 'done'/'error'. Dispatches on `workerData.script` ('ja' | 'ko') first so the
// dictionary load only happens for 'ja'; Korean needs none (docs/adr/0004).

const { parentPort, workerData } = require('worker_threads');
const kuromoji = require('kuromoji');
const wanakana = require('wanakana');
const koroman = require('koroman');
const { buildReadingDoc, buildRomanizationDoc } = require('./lyricsReading');
const { getKuromojiDicPath } = require('./kuromojiDictionary');
const {
  buildKuromojiTokenizer,
} = require('./japaneseReading/analyzers/kuromoji');

function buildTokenizer() {
  return buildKuromojiTokenizer(kuromoji, getKuromojiDicPath());
}

// koroman ships an `exports` map with no `./package.json` entry, so
// require('koroman/package.json') (the pattern used for kuromoji above)
// throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the real module file
// first and read its package.json from disk instead — do not "simplify"
// this back to a direct require of the package.json subpath.
function koromanVersion() {
  const path = require('path');
  const pkgPath = path.join(
    path.dirname(require.resolve('koroman')),
    '..',
    'package.json',
  );
  return require(pkgPath).version;
}

async function buildJapaneseDoc(lines, onProgress) {
  const tokenize = await buildTokenizer();
  return buildReadingDoc(lines, {
    tokenize,
    kanaToRomaji: (kana) => wanakana.toRomaji(kana),
    analyzer: {
      id: 'kuromoji-wanakana',
      version: require('kuromoji/package.json').version,
    },
    onProgress,
  });
}

function buildKoreanDoc(lines, onProgress) {
  return buildRomanizationDoc(lines, {
    romanize: (text) => koroman.romanize(text, { usePronunciationRules: true }),
    analyzer: { id: 'koroman', version: koromanVersion() },
    onProgress,
  });
}

(async () => {
  try {
    const { lines, script } = workerData;
    const onProgress = (progress) => {
      parentPort.postMessage({ type: 'progress', ...progress });
    };
    const doc =
      script === 'ko'
        ? buildKoreanDoc(lines, onProgress)
        : await buildJapaneseDoc(lines, onProgress);
    parentPort.postMessage({ type: 'done', result: doc });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      error: err.message || String(err),
    });
  }
})();
