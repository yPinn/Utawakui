import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { validateLyricsReadingBenchmark } from './contract.mjs';
import { roundMetric, scoreLyricsReadingBenchmark } from './scoring.mjs';

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');
const wanakana = require('wanakana');
const { buildReadingDoc } = require('../../../electron/lib/lyricsReading.js');
const {
  getKuromojiDicPath,
} = require('../../../electron/lib/kuromojiDictionary.js');
const {
  buildKuromojiTokenizer,
} = require('../../../electron/lib/japaneseReading/analyzers/kuromoji.js');

function directorySize(rootPath) {
  let total = 0;
  const pending = [rootPath];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) total += fs.statSync(entryPath).size;
    }
  }
  return total;
}

function packageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

export function collectLyricsReadingObservations(
  benchmark,
  { tokenize, kanaToRomaji, analyzer, now = () => performance.now() },
) {
  return benchmark.cases.map((benchmarkCase) => {
    const startedAt = now();
    try {
      const tokensByText = new Map();
      const captureTokens = (text) => {
        const tokens = tokenize(text);
        tokensByText.set(text, tokens);
        return tokens;
      };
      const document = buildReadingDoc(benchmarkCase.lines, {
        tokenize: captureTokens,
        kanaToRomaji,
        analyzer,
      });
      const targetText = benchmarkCase.lines[benchmarkCase.targetLineIndex];
      return {
        caseId: benchmarkCase.id,
        status: 'ok',
        durationMs: now() - startedAt,
        line: document.lines[benchmarkCase.targetLineIndex],
        tokens: tokensByText.get(targetText) ?? [],
      };
    } catch {
      return {
        caseId: benchmarkCase.id,
        status: 'failed',
        durationMs: now() - startedAt,
        errorCode: 'ANALYZER_FAILED',
      };
    }
  });
}

export async function runKuromojiReadingBenchmark(benchmark) {
  validateLyricsReadingBenchmark(benchmark);
  const rssBeforeBytes = process.memoryUsage().rss;
  const tokenizerStartedAt = performance.now();
  const tokenize = await buildKuromojiTokenizer(kuromoji, getKuromojiDicPath());
  const tokenizerLoadMs = performance.now() - tokenizerStartedAt;
  const analyzer = {
    id: 'kuromoji-wanakana',
    version: require('kuromoji/package.json').version,
  };

  const firstPassStartedAt = performance.now();
  const observations = collectLyricsReadingObservations(benchmark, {
    tokenize,
    kanaToRomaji: (kana) => wanakana.toRomaji(kana),
    analyzer,
  });
  const firstPassMs = performance.now() - firstPassStartedAt;
  const secondPassStartedAt = performance.now();
  collectLyricsReadingObservations(benchmark, {
    tokenize,
    kanaToRomaji: (kana) => wanakana.toRomaji(kana),
    analyzer,
  });
  const secondPassMs = performance.now() - secondPassStartedAt;

  return scoreLyricsReadingBenchmark(benchmark, {
    analyzer,
    observations,
    performance: {
      tokenizerLoadMs: roundMetric(tokenizerLoadMs),
      firstPassMs: roundMetric(firstPassMs),
      secondPassMs: roundMetric(secondPassMs),
      rssBeforeBytes,
      rssAfterBytes: process.memoryUsage().rss,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      dependencyBytes: {
        kuromoji: directorySize(packageRoot('kuromoji')),
        wanakana: directorySize(packageRoot('wanakana')),
      },
    },
  });
}
