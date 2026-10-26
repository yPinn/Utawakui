import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  RELEASE_SYMBOL_TARGETS,
  protectReleaseModule,
} from './runtime-symbol-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
function load(code, file) {
  const filename = path.join(root, file);
  const module = { exports: {} };
  vm.compileFunction(
    code,
    ['exports', 'require', 'module', '__filename', '__dirname'],
    { filename },
  )(
    module.exports,
    createRequire(filename),
    module,
    filename,
    path.dirname(filename),
  );
  return module.exports;
}

describe('first-phase release symbols', () => {
  it('owns exactly the two accepted Main-only source modules', () => {
    expect(RELEASE_SYMBOL_TARGETS.map((target) => target.file)).toEqual([
      'electron/lib/importRecordingPolicy.js',
      'electron/lib/artwork/releasePolicy.js',
    ]);
    expect(Object.isFrozen(RELEASE_SYMBOL_TARGETS)).toBe(true);
  });

  for (const file of [
    'electron/lib/importRecordingPolicy.js',
    'electron/lib/artwork/releasePolicy.js',
  ]) {
    it(`preserves exports, names, arity and deterministic output for ${file}`, () => {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      const result = protectReleaseModule(source, file);
      expect(protectReleaseModule(source, file)).toEqual(result);
      const original = load(source, file);
      const transformed = load(result.code, file);
      expect(Object.keys(transformed)).toEqual(Object.keys(original));
      for (const key of Object.keys(original)) {
        expect(transformed[key].name).toBe(original[key].name);
        expect(transformed[key].length).toBe(original[key].length);
      }
      expect(result.privateFunctions.length).toBe(
        file.includes('artwork') ? 13 : 3,
      );
      for (const name of result.privateFunctions)
        expect(result.code).not.toMatch(new RegExp(`function ${name}\\b`, 'u'));
      expect(result.map).toBeUndefined();
    });
  }

  it('preserves Unicode metadata, scoring boundaries, rankings and thrown errors', () => {
    for (const target of RELEASE_SYMBOL_TARGETS) {
      const source = fs.readFileSync(path.join(root, target.file), 'utf8');
      const original = load(source, target.file);
      const transformed = load(
        protectReleaseModule(source, target.file).code,
        target.file,
      );
      function compare(key, ...args) {
        expect(transformed[key](...structuredClone(args))).toEqual(
          original[key](...structuredClone(args)),
        );
      }
      if (target.file.includes('importRecording')) {
        for (const title of [
          '',
          'Song',
          'Song Live',
          '七 / 안녕 / 君',
          'Seven (feat. Latto)',
        ]) {
          for (const duration of [undefined, -1, 0, 180, 184, 195, 225, 226]) {
            const value = { title, artist: 'Artist', duration };
            compare('buildImportObservedTrack', value);
            compare(
              'compareImportRecordingIdentity',
              { title: 'Song', artist: 'Artist', duration: 180 },
              value,
            );
            compare(
              'scoreImportRecording',
              { title: 'Song', artist: 'Artist', duration: 180 },
              value,
            );
          }
        }
        for (const delta of [null, 0, 4, 5, 15, 16, 45, 46])
          compare('importDurationScore', delta);
        expect(() => transformed.buildImportObservedTrack(null)).toThrow(
          TypeError,
        );
        expect(() => original.buildImportObservedTrack(null)).toThrow(
          TypeError,
        );
      } else {
        const expected = {
          title: '君',
          artistCredit: '歌手',
          album: 'Album',
          duration: 180,
        };
        const candidates = ['Official', 'Bootleg', 'Pseudo-Release'].map(
          (status, index) => ({
            entityId: String(index),
            recordingTitle: '君',
            releaseTitle: 'Album',
            artistCredit: '歌手',
            duration: 180,
            status,
            secondaryTypes: [],
            front: { imageUrl: `https://example.invalid/${index}` },
          }),
        );
        for (const item of candidates)
          compare('evaluateArtworkCandidate', expected, item);
        compare('rankArtworkProposals', expected, candidates);
        compare('rankArtworkCandidates', expected, candidates);
        compare('rankArtworkCandidates', expected, []);
      }
    }
  });

  it.each([
    ['unknown module', 'module.exports={};', 'electron/lib/other.js'],
    ['syntax error', 'function {', 'electron/lib/importRecordingPolicy.js'],
    [
      'unknown export',
      'module.exports={surprise:1};',
      'electron/lib/importRecordingPolicy.js',
    ],
    [
      'computed exports',
      'module["exports"]={};',
      'electron/lib/importRecordingPolicy.js',
    ],
    [
      'dynamic exports',
      'module.exports=makeExports();',
      'electron/lib/importRecordingPolicy.js',
    ],
    [
      'multiple assignments',
      'module.exports={};module.exports={};',
      'electron/lib/importRecordingPolicy.js',
    ],
  ])(
    'rejects %s instead of silently weakening the boundary',
    (_name, source, file) => {
      expect(() => protectReleaseModule(source, file)).toThrow();
    },
  );

  it.each([
    'setInterval(()=>{}, 10);',
    'eval("1");',
    'new Function("return 1");',
    'scoreImportRecording.name;',
    'exports.extra=1;',
  ])(
    'fails closed for newly introduced reflection or side channels: %s',
    (extra) => {
      const file = 'electron/lib/importRecordingPolicy.js';
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(() => protectReleaseModule(source + extra, file)).toThrow();
    },
  );
});
