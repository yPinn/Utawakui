import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(
  new URL('./lyrics-reading-packaged-evaluation.cjs', import.meta.url),
);
const {
  assertTrustedPackageRoot,
  directorySize,
  runWorker,
  resolvePackagedReadingWorker,
  writeJsonNoClobber,
} = require(scriptPath);
const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/lyrics-reading-evaluation/synthetic-baseline.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const lines = fixture.cases.map(
  (benchmarkCase) => benchmarkCase.lines[benchmarkCase.targetLineIndex],
);

describe('packaged reading entry compatibility', () => {
  it('selects the physical bundle for the new package layout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-layout-'));
    try {
      const worker = path.join(
        root,
        'resources/app.asar.unpacked/runtime/reading.cjs',
      );
      fs.mkdirSync(path.dirname(worker), { recursive: true });
      fs.writeFileSync(worker, '');
      expect(resolvePackagedReadingWorker(root)).toBe(worker);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps historical source-layout packages evaluable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-layout-'));
    try {
      expect(resolvePackagedReadingWorker(root)).toBe(
        path.join(
          root,
          'resources/app.asar/electron/lib/lyricsReadingWorker.js',
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function createWorkerFile(rootPath, source) {
  const workerPath = path.join(rootPath, 'lyricsReadingWorker.js');
  fs.mkdirSync(path.dirname(workerPath), { recursive: true });
  fs.writeFileSync(workerPath, source, 'utf8');
  return workerPath;
}

describe('packaged lyrics reading evaluation', () => {
  it('measures a worker and writes its report without clobbering', async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-packaged-reading-'),
    );
    const workerPath = createWorkerFile(
      temporaryRoot,
      [
        "'use strict';",
        "const { parentPort, workerData } = require('node:worker_threads');",
        'parentPort.postMessage({',
        "  type: 'done',",
        '  result: {',
        "    analyzer: { id: 'kuromoji-wanakana', version: 'test' },",
        '    lines: workerData.lines.map((text) => ({',
        '      text,',
        '      segments: [{ t: text }],',
        "      romaji: '',",
        '      edited: false,',
        '    })),',
        '  },',
        '});',
      ].join('\n'),
    );
    const outputPath = path.join(temporaryRoot, 'report.json');

    try {
      const measurement = await runWorker(
        workerPath,
        lines,
        fixture.baselineAnalyzerId,
      );
      expect(measurement).toMatchObject({
        analyzer: { id: 'kuromoji-wanakana', version: 'test' },
      });
      expect(measurement.coldWorkerMs).toBeGreaterThanOrEqual(0);
      expect(measurement.coldBatchLinesPerSecond).toBeGreaterThan(0);
      expect(measurement.peakProcessRssBytes).toBeGreaterThan(0);

      writeJsonNoClobber(outputPath, measurement);
      const before = fs.readFileSync(outputPath, 'utf8');
      expect(() => writeJsonNoClobber(outputPath, {})).toThrow(
        /already exists/i,
      );
      expect(fs.readFileSync(outputPath, 'utf8')).toBe(before);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('fails immediately when the worker exits without a terminal message', async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-packaged-reading-exit-'),
    );
    const workerPath = createWorkerFile(temporaryRoot, "'use strict';\n");

    try {
      const startedAt = Date.now();
      await expect(
        runWorker(workerPath, lines, fixture.baselineAnalyzerId),
      ).rejects.toThrow(/exited before returning a result/i);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('binds package evaluation to the invoking executable and bounds scanning', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-packaged-reading-root-'),
    );
    const executablePath = path.join(temporaryRoot, 'electron.exe');
    fs.writeFileSync(executablePath, 'synthetic executable', 'utf8');
    fs.writeFileSync(path.join(temporaryRoot, 'one.bin'), '1', 'utf8');

    try {
      expect(assertTrustedPackageRoot(temporaryRoot, executablePath)).toBe(
        fs.realpathSync.native(temporaryRoot),
      );
      expect(() =>
        assertTrustedPackageRoot(os.tmpdir(), executablePath),
      ).toThrow(/invoking executable/i);
      expect(() => directorySize(temporaryRoot, { maximumEntries: 1 })).toThrow(
        /entry limit/i,
      );
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
