import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildReleaseRuntime } from './build-release-runtime.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const temporary = [];
function temp(parent = path.join(root, 'tasks')) {
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'utawakui-release-'));
  temporary.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true });
});
function runWorker(filename, workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(filename, { workerData });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error('worker deadline'));
    }, 10000);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      clearTimeout(timer);
      if (code) reject(Error(`worker exited ${code}`));
    });
    worker.on('message', (message) => {
      if (message.type === 'done' || message.type === 'error') resolve(message);
    });
  });
}

describe('release build semantics', () => {
  it('preserves lazy CommonJS execution, ESM interop and source-relative paths after relocation', async () => {
    const project = temp();
    fs.mkdirSync(path.join(project, 'electron/nested'), { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), '{"type":"commonjs"}');
    fs.writeFileSync(
      path.join(project, 'electron/entry.js'),
      `
      globalThis.releaseOrder = ['entry'];
      module.exports = { name: 'entry', dirname: __dirname,
        load: () => require('./nested/lazy.js'),
        esm: () => require('./nested/lazy.mjs').value };
    `,
    );
    fs.writeFileSync(
      path.join(project, 'electron/nested/lazy.js'),
      `
      globalThis.releaseOrder.push('lazy');
      module.exports = { dirname: __dirname, filename: __filename };
    `,
    );
    fs.writeFileSync(
      path.join(project, 'electron/nested/lazy.mjs'),
      `
      globalThis.releaseOrder.push('esm'); export const value = 42;
    `,
    );
    const outputDirectory = path.join(project, 'runtime');
    await buildReleaseRuntime({
      rootDirectory: project,
      outputDirectory,
      entries: { main: { source: 'electron/entry.js', file: 'main.cjs' } },
    });
    const moved = path.join(project, 'moved');
    fs.mkdirSync(moved);
    fs.renameSync(outputDirectory, path.join(moved, 'runtime'));
    try {
      const entry = require(path.join(moved, 'runtime/main.cjs'));
      expect(globalThis.releaseOrder).toEqual(['entry']);
      expect(entry.dirname).toBe(path.join(moved, 'electron'));
      expect(entry.load()).toEqual({
        dirname: path.join(moved, 'electron/nested'),
        filename: path.join(moved, 'electron/nested/lazy.js'),
      });
      expect(entry.esm()).toBe(42);
      expect(globalThis.releaseOrder).toEqual(['entry', 'lazy', 'esm']);
      expect(fs.readdirSync(path.join(moved, 'runtime'))).toEqual(['main.cjs']);
    } finally {
      delete globalThis.releaseOrder;
    }
  });

  it('refuses an output directory outside the project or on top of source', async () => {
    const project = temp();
    for (const outputDirectory of [
      project,
      path.dirname(project),
      path.join(project, 'electron'),
      path.join(project, 'tasks'),
      path.join(project, '.tmp'),
    ]) {
      await expect(
        buildReleaseRuntime({ rootDirectory: project, outputDirectory }),
      ).rejects.toThrow(/isolated build directory/u);
    }
  });

  it('keeps a relocated probe able to launch itself without its original source', async () => {
    const project = temp();
    const source = path.join(project, 'electron/lib/lyricsAcoustic/probe.js');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(
      source,
      `
      if (process.argv[2] === '--child') process.stdout.write(__filename);
      module.exports = { self: () => require('node:child_process').execFileSync(
        process.execPath, [__filename, '--child'], { encoding: 'utf8', windowsHide: true }) };
    `,
    );
    const outputDirectory = path.join(project, 'runtime');
    await buildReleaseRuntime({
      rootDirectory: project,
      outputDirectory,
      entries: {
        lyricsProbe: {
          source: 'electron/lib/lyricsAcoustic/probe.js',
          file: 'probe.cjs',
        },
      },
    });
    fs.unlinkSync(source);
    const probe = path.join(outputDirectory, 'probe.cjs');
    expect(require(probe).self()).toBe(probe);
  });
});

describe('application release entries', () => {
  let outputDirectory;
  beforeAll(async () => {
    outputDirectory = path.join(temp(path.join(root, 'tasks')), 'runtime');
    await buildReleaseRuntime({ rootDirectory: root, outputDirectory });
  });

  it('emits only seven minified CJS entries without source maps or original module paths', () => {
    expect(fs.readdirSync(outputDirectory).sort()).toEqual([
      'main.cjs',
      'performer-preload.cjs',
      'preload.cjs',
      'probe.cjs',
      'reading.cjs',
      'separation.cjs',
      'waveform.cjs',
    ]);
    const main = fs.readFileSync(
      path.join(outputDirectory, 'main.cjs'),
      'utf8',
    );
    expect(main).not.toContain(root);
    expect(main).not.toContain('sourceMappingURL');
    expect(main).not.toContain('// electron/');
  });

  it.each([
    ['preload.cjs', 'Utawakui'],
    ['performer-preload.cjs', 'UtawakuiPerformer'],
  ])('loads %s in the sandbox preload module allowlist', (file, apiName) => {
    const apis = {};
    const invoke = vi.fn();
    vm.runInNewContext(
      fs.readFileSync(path.join(outputDirectory, file), 'utf8'),
      {
        process: { argv: ['--ui-theme=dark'] },
        require(id) {
          expect(id).toBe('electron');
          return {
            contextBridge: {
              exposeInMainWorld: (name, api) => (apis[name] = api),
            },
            ipcRenderer: {
              invoke,
              on: vi.fn(),
              send: vi.fn(),
              removeListener: vi.fn(),
            },
          };
        },
      },
    );
    expect(apis[apiName].initialUiTheme).toBe('dark');
    expect(apis[apiName]).not.toHaveProperty('beginMicrophoneResearch');
    expect(apis[apiName]).not.toHaveProperty('endMicrophoneResearch');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['ja', '君のことが好き'],
    ['ko', '안녕하세요'],
  ])(
    'preserves actual %s worker results and dictionary/module resolution',
    async (script, text) => {
      const workerData = { script, lines: [{ text, time: 0 }] };
      const source = await runWorker(
        path.join(root, 'electron/lib/lyricsReadingWorker.js'),
        workerData,
      );
      const bundled = await runWorker(
        path.join(outputDirectory, 'reading.cjs'),
        workerData,
      );
      expect(source.type).toBe('done');
      expect(bundled).toEqual(source);
    },
  );

  it('keeps the ONNX probe import inert and its CLI failure exit intact', () => {
    const probePath = path.join(outputDirectory, 'probe.cjs');
    expect(fs.readFileSync(probePath, 'utf8')).toContain('runtime/probe.cjs');
    expect(require(probePath).probeLyricsEnvironment).toBeTypeOf('function');
    const result = spawnSync(process.execPath, [probePath], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });
});
