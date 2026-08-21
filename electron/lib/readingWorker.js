'use strict';

// Runs buildReadingDoc() off the main thread, mirroring
// vocalSeparationWorker.js's shape exactly. Building the tokenizer loads
// kuromoji's IPADIC dictionary (CPU/memory heavy, ~1-3s) — this must never
// happen on the main process or at startup, same reasoning as
// onnxruntime-node in vocalSeparationWorker.js.
//
// Messages are `type`-discriminated (not an `ok` boolean): zero+
// 'progress', then one 'done'/'error'.

const { parentPort, workerData } = require('worker_threads');
const kuromoji = require('kuromoji');
const wanakana = require('wanakana');
const { buildReadingDoc } = require('./reading');
const { getKuromojiDicPath } = require('./kuromojiDictionary');

function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: getKuromojiDicPath() })
      .build((err, tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
  });
}

(async () => {
  try {
    const { lines } = workerData;
    const tokenizer = await buildTokenizer();
    const doc = buildReadingDoc(lines, {
      tokenize: (text) => tokenizer.tokenize(text),
      kanaToRomaji: (kana) => wanakana.toRomaji(kana),
      analyzer: {
        id: 'kuromoji-wanakana',
        version: require('kuromoji/package.json').version,
      },
      onProgress: (progress) => {
        parentPort.postMessage({ type: 'progress', ...progress });
      },
    });
    parentPort.postMessage({ type: 'done', result: doc });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      error: err.message || String(err),
    });
  }
})();
