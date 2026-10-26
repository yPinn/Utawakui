import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildReleaseRuntime } from './build-release-runtime.mjs';
import {
  protectReleaseModule,
  RELEASE_SYMBOL_TARGETS,
} from './runtime-symbol-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(root, 'tasks/symbol-integration-'));
let baseline;
let candidate;
beforeAll(async () => {
  baseline = await buildReleaseRuntime({
    outputDirectory: path.join(temporary, 'baseline/runtime'),
    protectSymbols: false,
  });
  candidate = await buildReleaseRuntime({
    outputDirectory: path.join(temporary, 'candidate/runtime'),
  });
});
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));

describe('release symbol build integration', () => {
  it('protects only the two accepted Main modules and leaves the other five bundles identical', () => {
    expect(baseline.protectedModules).toEqual([]);
    expect(
      candidate.protectedModules.map((entry) => entry.file).sort(),
    ).toEqual(RELEASE_SYMBOL_TARGETS.map((entry) => entry.file).sort());
    expect(candidate.modules).toEqual(baseline.modules);
    for (const file of candidate.files) {
      const original = fs.readFileSync(
        path.join(temporary, 'baseline/runtime', file),
      );
      const transformed = fs.readFileSync(
        path.join(temporary, 'candidate/runtime', file),
      );
      expect(transformed.equals(original), file).toBe(file !== 'main.cjs');
    }
    const main = fs.readFileSync(
      path.join(temporary, 'candidate/runtime/main.cjs'),
      'utf8',
    );
    expect(main).not.toMatch(/function confidenceFields\b/u);
    expect(main).not.toMatch(/function compareEvaluatedCandidates\b/u);
    for (const target of RELEASE_SYMBOL_TARGETS)
      for (const name of target.exports)
        expect(main).toContain(`function ${name}(`);
    expect(main).toContain('function classifyLyricsMatch(');
    expect(main).toContain('function aggregateLyricsProviderResults(');
    expect(main).not.toContain('sourceMappingURL');
  });

  it('keeps Node ESM named imports statically discoverable from transformed CJS', async () => {
    for (const target of RELEASE_SYMBOL_TARGETS) {
      const source = fs.readFileSync(path.join(root, target.file), 'utf8');
      const filename = path.join(
        temporary,
        path.basename(target.file) + '.cjs',
      );
      const requirePrefix = `require = require('node:module').createRequire(${JSON.stringify(path.join(root, target.file))});\n`;
      fs.writeFileSync(
        filename,
        requirePrefix + protectReleaseModule(source, target.file).code,
      );
      const imported = await import(pathToFileURL(filename).href);
      for (const name of target.exports)
        expect(imported[name]).toBeTypeOf('function');
    }
  });

  it('retains lazy initialization for an accepted module', async () => {
    const project = path.join(temporary, 'fixture');
    fs.mkdirSync(path.join(project, 'electron/lib'), { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), '{"type":"commonjs"}');
    const names = RELEASE_SYMBOL_TARGETS[0].exports;
    fs.writeFileSync(
      path.join(project, 'electron/lib/importRecordingPolicy.js'),
      `globalThis.symbolLazy = (globalThis.symbolLazy || 0) + 1; function internalHelper(){ return 42; } ${names.map((name) => `function ${name}(){return internalHelper();}`).join('\n')} module.exports={${names.join(',')}};`,
    );
    fs.writeFileSync(
      path.join(project, 'electron/entry.js'),
      "module.exports={load:()=>require('./lib/importRecordingPolicy.js')};",
    );
    await buildReleaseRuntime({
      rootDirectory: project,
      outputDirectory: path.join(project, 'runtime'),
      entries: { main: { source: 'electron/entry.js', file: 'main.cjs' } },
    });
    const { createRequire } = await import('node:module');
    const entry = createRequire(import.meta.url)(
      path.join(project, 'runtime/main.cjs'),
    );
    try {
      expect(globalThis.symbolLazy).toBeUndefined();
      expect(entry.load().scoreImportRecording()).toBe(42);
      expect(globalThis.symbolLazy).toBe(1);
    } finally {
      delete globalThis.symbolLazy;
    }
  });
  it('rejects invalid modes and target modules reaching a non-Main entry', async () => {
    await expect(
      buildReleaseRuntime({ protectSymbols: 'yes' }),
    ).rejects.toThrow(/symbol mode/u);
    const project = path.join(temporary, 'outside-main');
    fs.mkdirSync(path.join(project, 'electron/lib'), { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), '{"type":"commonjs"}');
    fs.writeFileSync(
      path.join(project, 'electron/lib/importRecordingPolicy.js'),
      'module.exports={};',
    );
    await expect(
      buildReleaseRuntime({
        rootDirectory: project,
        outputDirectory: path.join(project, 'runtime'),
        entries: {
          readingWorker: {
            source: 'electron/lib/importRecordingPolicy.js',
            file: 'reading.cjs',
          },
        },
      }),
    ).rejects.toThrow(/outside Main/u);
  });
});
