import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.js';
import {
  APP_SOURCE_PATTERN,
  classifyAppSource,
  coveragePolicy,
} from './coveragePolicy.js';

const root = path.resolve(import.meta.dirname, '..');

function trackedAppSources() {
  const result = spawnSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => APP_SOURCE_PATTERN.test(file))
    .filter((file) => !/\.test\.(?:js|mjs)$/.test(file));
}

describe('coverage policy', () => {
  it('classifies every tracked application source as measured or deferred', () => {
    const unclassified = trackedAppSources().filter(
      (file) => classifyAppSource(file).status === 'unclassified',
    );

    expect(unclassified).toEqual([]);
  });

  it('measures ordinary domain logic instead of deferring low coverage', () => {
    for (const file of [
      'electron/lib/downloader.js',
      'electron/main/configHandlers.js',
      'electron/preload.js',
      'electron/performerPreload.js',
      'overlay/now-playing/now-playing.mjs',
      'shared/outputContract.js',
      'src/composables/usePlaylistActions.js',
      'src/constants/featureGates.js',
      'src/utils/lyrics.js',
    ]) {
      expect(classifyAppSource(file), file).toEqual({ status: 'measured' });
    }
  });

  it('recognizes both JavaScript module formats under shared contracts', () => {
    expect(APP_SOURCE_PATTERN.test('shared/outputContract.js')).toBe(true);
    expect(APP_SOURCE_PATTERN.test('shared/presentation/state.mjs')).toBe(true);
  });

  it.each([
    ['electron/main.js', 'electron-entrypoint'],
    ['electron/lib/lyricsReadingWorker.js', 'child-process-entrypoint'],
    ['electron/lib/vocalSeparationWorker.js', 'child-process-entrypoint'],
    ['src/main.js', 'renderer-entrypoint'],
    ['src/performer-main.js', 'renderer-entrypoint'],
    ['src/App.vue', 'vue-sfc-runtime'],
    ['src/components/ui/UiButton.vue', 'vue-sfc-runtime'],
  ])('defers %s only at its runtime boundary', (file, reason) => {
    expect(classifyAppSource(file)).toEqual({ status: 'deferred', reason });
  });

  it.each([
    'overlay/shared/lyricsPresentation.mjs',
    'overlay/shared/mangaFrameContract.mjs',
    'overlay/shared/state.mjs',
    'src/icons/index.js',
  ])('marks re-export-only module %s as coverage-neutral', (file) => {
    expect(classifyAppSource(file)).toEqual({
      status: 'coverage-neutral',
      reason: 're-export-only',
    });
    expect(coveragePolicy.exclude).toContain(file);
  });

  it('shares include, exclude, and global thresholds with Vitest', () => {
    expect(viteConfig.test.coverage.include).toEqual(coveragePolicy.include);
    expect(viteConfig.test.coverage.exclude).toEqual(coveragePolicy.exclude);
    expect(viteConfig.test.coverage.thresholds).toEqual(
      coveragePolicy.globalThresholds,
    );
    expect(viteConfig.test.coverage.reporter).toContain('json-summary');
  });

  it('preserves already measured pure release and build tooling', () => {
    expect(coveragePolicy.include).toEqual(
      expect.arrayContaining([
        'scripts/audio-separator-roformer-wheel-patch.mjs',
        'scripts/release-contract.mjs',
      ]),
    );
  });

  it('includes both executable preload bridges in coverage', () => {
    expect(coveragePolicy.include).toEqual(
      expect.arrayContaining([
        'electron/preload.js',
        'electron/performerPreload.js',
      ]),
    );
  });

  it('measures nested renderer composable support modules', () => {
    expect(coveragePolicy.include).toContain('src/composables/**/*.js');
    expect(
      classifyAppSource('src/composables/player/usePlayerAudioGraph.js'),
    ).toEqual({ status: 'measured' });
  });

  it('does not let imported static JSON inflate executable coverage', () => {
    expect(coveragePolicy.exclude).toContain('shared/**/*.json');
  });

  it('names destructive, network, diagnostics, and public-output files for per-file ratchets', () => {
    expect(coveragePolicy.files.map(({ path: filePath }) => filePath)).toEqual(
      expect.arrayContaining([
        'electron/lib/diagnostics.js',
        'electron/lib/downloader.js',
        'electron/lib/featureDependencies/archive.js',
        'electron/lib/outputServer/http.js',
        'electron/main/configHandlers.js',
        'electron/main/externalNavigationHandlers.js',
        'electron/main/featureDependencyHandlers.js',
        'electron/main/featureGateHandlers.js',
        'electron/main/lyrics/acquisitionHandlers.js',
        'electron/main/lyrics/documentHandlers.js',
        'electron/main/lyrics/readingHandlers.js',
        'electron/main/mediaProtocol.js',
        'electron/main/windowState.js',
        'electron/main/libraryPathSidecar.js',
        'electron/main/outputRuntime.js',
        'electron/preload.js',
        'electron/performerPreload.js',
        'shared/outputContract.js',
        'shared/outputStreamContract.js',
        'src/composables/useMusicAnalysisWorkbench.js',
        'src/composables/analysis/useMusicAnalysisCapability.js',
        'src/composables/analysis/useMusicAnalysisJob.js',
        'src/composables/useFeatureDependencies.js',
        'src/composables/useFeatureGatePresentation.js',
        'src/composables/useFeatureGates.js',
        'src/composables/useImportSession.js',
        'src/composables/import/useImportSourceResolution.js',
        'src/composables/import/useImportExecution.js',
        'src/composables/useLyrics.js',
        'src/composables/lyrics/useLyricsAcquisition.js',
        'src/composables/lyrics/useLyricsSourceDocuments.js',
        'src/composables/useMediaSession.js',
        'src/composables/usePlayer.js',
        'src/composables/player/usePlayerAudioGraph.js',
        'src/composables/useOutputRuntime.js',
        'src/composables/output/useOutputProjectionPublisher.js',
        'src/composables/usePerformerViewState.js',
      ]),
    );
  });

  it('runs domain and per-file ratchets after Vitest coverage', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    expect(packageJson.scripts['test:coverage']).toContain(
      'node scripts/coverageRatchet.js',
    );
  });
});
