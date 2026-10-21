import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const packageJson = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const builder = yaml.load(
  readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'),
);
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  'electron',
  'original-fs',
]);

// Working-tree runtime code, including unstaged moves before a commit.
const runtimeSources = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'electron',
    'shared',
    'overlay',
  ],
  { cwd: root, encoding: 'utf8' },
)
  .split('\n')
  .filter((file) => /\.(c?js|mjs)$/u.test(file) && !/\.test\./u.test(file))
  .filter((file) => existsSync(path.join(root, file)))
  .map((file) => ({
    file,
    // Whole-line comments only; block-comment stripping would cut globs in strings.
    source: readFileSync(path.join(root, file), 'utf8').replace(
      /^\s*(?:\/\/|\*|\/\*).*$/gmu,
      '',
    ),
  }));

const SPECIFIER_PATTERNS = [
  /\brequire(?:\.resolve)?\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/gmu,
  /^\s*\}\s*from\s*['"]([^'"]+)['"]/gmu,
  /^\s*import\s*['"]([^'"]+)['"]/gmu,
];

function bareSpecifiers() {
  const uses = [];
  for (const { file, source } of runtimeSources) {
    for (const pattern of SPECIFIER_PATTERNS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
        if (builtins.has(specifier) || builtins.has(specifier.split('/')[0])) {
          continue;
        }
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        uses.push({ file, specifier, name });
      }
    }
  }
  return uses;
}

const dependencies = new Set(Object.keys(packageJson.dependencies));

describe('packaged dependency boundary', () => {
  it('ships session archive/history runtime under existing boundaries while excluding their tests', () => {
    for (const file of [
      'electron/lib/performanceSessionArchive.js',
      'electron/main/performanceSessionHistoryHandlers.js',
    ]) {
      expect(runtimeSources.some((source) => source.file === file)).toBe(true);
      expect(
        builder.files.some(
          (glob) => !glob.startsWith('!') && path.matchesGlob(file, glob),
        ),
      ).toBe(true);
      expect(
        builder.files.some(
          (glob) =>
            glob.startsWith('!') && path.matchesGlob(file, glob.slice(1)),
        ),
      ).toBe(false);
      expect(
        builder.files.some(
          (glob) =>
            glob.startsWith('!') &&
            path.matchesGlob(file.replace('.js', '.test.js'), glob.slice(1)),
        ),
      ).toBe(true);
    }
    expect(
      builder.asarUnpack.some((glob) =>
        path.matchesGlob('electron/lib/performanceSessionArchive.js', glob),
      ),
    ).toBe(true);
  });
  it('keeps synthetic test corpora in source and outside the packaged runtime', () => {
    const fixtures = ['electron/lib/fixtures', 'electron/lib/lrclib/fixtures']
      .flatMap((directory) =>
        readdirSync(path.join(root, directory), {
          recursive: true,
          withFileTypes: true,
        }),
      )
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path
          .relative(root, path.join(entry.parentPath, entry.name))
          .replaceAll('\\', '/'),
      );
    expect(fixtures.length).toBeGreaterThan(0);
    for (const file of fixtures) {
      const included = builder.files.some(
        (glob) => !glob.startsWith('!') && path.matchesGlob(file, glob),
      );
      const excluded = builder.files.some(
        (glob) => glob.startsWith('!') && path.matchesGlob(file, glob.slice(1)),
      );
      expect(included && !excluded, file).toBe(false);
    }
  });

  it('keeps the shared native icon packaged and unpacked for Windows shell APIs', () => {
    const nativeIcon = 'public/assets/icons/app-icon.ico';
    expect(builder.win.icon).toBe(nativeIcon);
    expect(builder.files).toContain(nativeIcon);
    expect(builder.asarUnpack).toContain(nativeIcon);
    const icon = readFileSync(path.join(root, nativeIcon));
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon.readUInt16LE(4)).toBeGreaterThan(0);
  });

  it('ships the shared service cooldown helper while excluding its tests', () => {
    const helper = 'electron/lib/providerServiceCooldown.js';
    expect(runtimeSources.some(({ file }) => file === helper)).toBe(true);
    expect(
      builder.files.some(
        (glob) => !glob.startsWith('!') && path.matchesGlob(helper, glob),
      ),
    ).toBe(true);
    expect(
      builder.files.some(
        (glob) =>
          glob.startsWith('!') && path.matchesGlob(helper, glob.slice(1)),
      ),
    ).toBe(false);
    expect(
      builder.asarUnpack.some((glob) => path.matchesGlob(helper, glob)),
    ).toBe(true);
    for (const file of [
      'electron/lib/providerServiceCooldown.test.js',
      'electron/lib/providerServiceCooldown.integration.test.js',
    ]) {
      expect(
        builder.files.some(
          (glob) =>
            glob.startsWith('!') && path.matchesGlob(file, glob.slice(1)),
        ),
      ).toBe(true);
    }
    expect(
      require('./electron/lib/providerServiceCooldown.js')
        .createProviderRequestGuard,
    ).toBeTypeOf('function');
  });
  it('ships the optional lyrics environment probe/catalog without private research assets', () => {
    for (const filename of [
      'lyrics_acoustic_probe.py',
      'lyrics-acoustic-catalog.json',
    ]) {
      expect(builder.extraResources).toContainEqual({
        from: `resources/audio-processing/${filename}`,
        to: `audio-processing/${filename}`,
      });
    }
    const catalog = JSON.parse(
      readFileSync(
        path.join(
          root,
          'resources/audio-processing/lyrics-acoustic-catalog.json',
        ),
        'utf8',
      ),
    );
    expect(catalog.productUse).toBe('blocked');
    expect(catalog.blockReason).toBe('weights-evidence-pending');
    expect(builder.files).not.toContain('scripts/research/**/*');
  });
  it('ships only the bounded research runtime, never private bindings, corpus or CLI', () => {
    for (const file of [
      'scripts/research/lyricsAcoustic/frontend.cjs',
      'scripts/research/lyricsAcoustic/decoder.py',
      'scripts/research/lyricsAcoustic/job.cjs',
      'scripts/research/lyricsAcoustic/english.cjs',
      'scripts/research/lyricsAcoustic/manifest.json',
      'electron/lib/lyricsResearch/automatic.js',
      'electron/lib/lyricsResearch/estimates.js',
      'electron/main/lyrics/experimentalHandlers.js',
    ]) {
      const included = builder.files.some(
        (glob) => !glob.startsWith('!') && path.matchesGlob(file, glob),
      );
      const excluded = builder.files.some(
        (glob) => glob.startsWith('!') && path.matchesGlob(file, glob.slice(1)),
      );
      expect(included && !excluded).toBe(true);
    }
  });
  it('keeps research CLIs, credentials, downloads and evaluation data excluded', () => {
    for (const file of [
      'scripts/research/lyricsFreshEvaluation/trial.cjs',
      'scripts/research/lyricsAcoustic/evaluate.cjs',
      'scripts/research/lyricsAlignmentCandidates/qwen_worker.py',
      '.tmp/hfa-runtime.json',
      'tasks/labels.json',
    ]) {
      expect(
        builder.files.some(
          (glob) => !glob.startsWith('!') && path.matchesGlob(file, glob),
        ),
      ).toBe(false);
    }
    for (const file of [
      'src/package.json',
      'src/utils/lyrics.js',
      'src/utils/lyricsDocument.js',
      'scripts/research/lyricsFreshEvaluation/trial-assets.json',
    ])
      expect(builder.files).toContain(file);
    for (const file of ['frontend.cjs', 'decoder.py'])
      expect(builder.asarUnpack).toContain(
        'scripts/research/lyricsAcoustic/' + file,
      );
    expect(
      require('./electron/lib/lyricsResearch/engine.js').runResearchPreview,
    ).toBeTypeOf('function');
  });
  it('keeps model-independent lyric estimate runtime inside existing packaged source boundaries', () => {
    expect(builder.files).toContain('electron/**/*');
    expect(builder.files).toContain('shared/**/*');
    for (const file of [
      'electron/lib/library/lyricsAcousticEstimates.js',
      'electron/main/lyrics/acousticEstimateHandlers.js',
      'shared/lyricsAcousticEstimate.mjs',
      'shared/presentation/lyricsAcousticPreview.mjs',
    ]) {
      expect(
        readFileSync(path.join(root, file), 'utf8').length,
      ).toBeGreaterThan(0);
    }
    expect(
      typeof require('./electron/lib/library/lyricsAcousticEstimates.js')
        .loadTrackAcousticEstimate,
    ).toBe('function');
  });
  it('packages the preview session initializer while excluding its tests', () => {
    for (const [file, expected] of [
      ['electron/main/previewSession.js', true],
      ['electron/main/previewSession.test.js', false],
    ]) {
      const included = builder.files.some(
        (glob) => !glob.startsWith('!') && path.matchesGlob(file, glob),
      );
      const excluded = builder.files.some(
        (glob) => glob.startsWith('!') && path.matchesGlob(file, glob.slice(1)),
      );
      expect(included && !excluded).toBe(expected);
    }
  });

  it('packages the F2 Overlay host while excluding its tests and F1 fixture tooling', () => {
    for (const [file, expected] of [
      ['overlay/shared/lifecycle.mjs', true],
      ['overlay/shared/lifecycle.test.js', false],
      ['overlay/assets/streamer-guide.png', true],
      ['shared/presentation/outputPreviewScene.mjs', true],
      ['shared/presentation/outputPreviewScene.test.js', false],
      ['scripts/outputAppearanceBaseline.mjs', false],
      ['scripts/fixtures/output/scenarios.json', false],
      ['scripts/fixtures/output/cover.png', false],
      ['scripts/outputAppearanceAudit.mjs', false],
      ['scripts/output-appearance-audit.mjs', false],
      ['scripts/output-appearance-capture.cjs', false],
      ['scripts/output-appearance-audit.test.mjs', false],
      ['scripts/outputPerformanceProbe.mjs', false],
      ['scripts/output-performance-probe.mjs', false],
      ['scripts/output-performance-driver.cjs', false],
      ['src/assets/output-template-thumbnails/provenance.json', false],
    ]) {
      const included = builder.files.some(
        (glob) => !glob.startsWith('!') && path.matchesGlob(file, glob),
      );
      const excluded = builder.files.some(
        (glob) => glob.startsWith('!') && path.matchesGlob(file, glob.slice(1)),
      );
      expect(included && !excluded).toBe(expected);
    }
  });

  it('declares every package the packaged runtime loads as a dependency', () => {
    const undeclared = bareSpecifiers()
      .filter(({ name }) => !dependencies.has(name))
      .map(({ file, specifier }) => `${file} -> ${specifier}`);

    expect(runtimeSources.length).toBeGreaterThan(100);
    expect(undeclared).toEqual([]);
  });

  it('keeps no production dependency the packaged runtime never loads', () => {
    const used = new Set(bareSpecifiers().map(({ name }) => name));

    expect([...dependencies].filter((name) => !used.has(name))).toEqual([]);
  });

  it('never trims a file the packaged runtime resolves', () => {
    const exclusions = builder.files
      .filter((pattern) => pattern.startsWith('!node_modules/'))
      .map((pattern) => pattern.slice(1));
    const inclusions = builder.files.filter((pattern) =>
      pattern.startsWith('node_modules/'),
    );
    const trimmed = bareSpecifiers()
      .map(({ file, specifier }) => {
        const resolved = path
          .relative(root, require.resolve(specifier))
          .split(path.sep)
          .join('/');
        return { file, specifier, resolved };
      })
      .filter(
        ({ resolved }) =>
          exclusions.some((glob) => path.matchesGlob(resolved, glob)) &&
          !inclusions.some((glob) => path.matchesGlob(resolved, glob)),
      )
      .map(
        ({ file, specifier, resolved }) =>
          `${file} -> ${specifier} (${resolved})`,
      );

    expect(exclusions.length).toBeGreaterThan(0);
    expect(trimmed).toEqual([]);
  });
});
