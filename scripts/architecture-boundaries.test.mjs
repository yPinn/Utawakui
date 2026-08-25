import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('architecture ownership boundaries', () => {
  it('keeps config, feature gates, and external navigation in separate IPC owners', () => {
    const main = read('electron/main.js');
    const config = read('electron/main/configHandlers.js');
    const featureGates = read('electron/main/featureGateHandlers.js');
    const externalNavigation = read(
      'electron/main/externalNavigationHandlers.js',
    );
    const preload = read('electron/preload.js');
    const virtualCableGuide = read(
      'src/components/settings/VirtualCableGuideModal.vue',
    );

    expect(main).toContain("require('./main/configHandlers')");
    expect(main).toContain("require('./main/featureGateHandlers')");
    expect(main).toContain("require('./main/externalNavigationHandlers')");
    expect(config).not.toContain('feature-gates:');
    expect(config).not.toContain('shell:open-external');
    expect(featureGates).toContain("'feature-gates:list'");
    expect(featureGates).toContain("'feature-gates:confirm'");
    expect(externalNavigation).toContain("'shell:open-external'");
    expect(preload).toContain('openExternalTarget');
    expect(preload).not.toContain('openExternalUrl');
    expect(virtualCableGuide).not.toContain('https://');
    expect(virtualCableGuide).not.toContain('openExternalUrl');
  });

  it('keeps app-wide presentation contracts outside the Overlay delivery tree', () => {
    for (const relativePath of [
      'src/components/output/MangaFrameSvg.vue',
      'src/components/output/ObsTemplateMockup.vue',
      'src/composables/usePerformerViewState.js',
      'src/utils/performerView.js',
    ]) {
      expect(read(relativePath)).not.toContain('overlay/shared/');
    }

    for (const filename of [
      'lyricsPresentation.mjs',
      'mangaFrameContract.mjs',
      'state.mjs',
    ]) {
      expect(existsSync(resolve(root, 'shared/presentation', filename))).toBe(
        true,
      );
    }
  });

  it('removes unreferenced OBS wrapper views', () => {
    expect(existsSync(resolve(root, 'src/views/ObsLyricsView.vue'))).toBe(
      false,
    );
    expect(existsSync(resolve(root, 'src/views/ObsSetlistView.vue'))).toBe(
      false,
    );
  });

  it('keeps featureDependencies.js as a small compatibility barrel', () => {
    const barrel = read('electron/lib/featureDependencies.js');
    expect(barrel.split(/\r?\n/u).length).toBeLessThan(100);
    for (const filename of [
      'registry.js',
      'download.js',
      'archive.js',
      'manifests.js',
      'providerRuntime.js',
      'ffmpeg.js',
      'models.js',
      'service.js',
    ]) {
      expect(
        existsSync(resolve(root, 'electron/lib/featureDependencies', filename)),
      ).toBe(true);
    }
  });

  it('keeps Output HTTP delivery separate from WebSocket state ownership', () => {
    const entry = read('electron/lib/outputServer.js');
    const httpDelivery = read('electron/lib/outputServer/http.js');

    expect(entry).toContain("require('./outputServer/http')");
    expect(entry.split(/\r?\n/u).length).toBeLessThan(700);
    expect(httpDelivery).not.toContain("require('ws')");
    expect(httpDelivery).not.toContain('createOutputClientDelivery');
    expect(httpDelivery).toContain('createOutputHttpHandler');
  });

  it('keeps the Lyrics IPC facade split by product responsibility', () => {
    const facade = read('electron/main/lyricsHandlers.js');
    const acquisition = read('electron/main/lyrics/acquisitionHandlers.js');
    const documents = read('electron/main/lyrics/documentHandlers.js');
    const readings = read('electron/main/lyrics/readingHandlers.js');

    expect(facade.split(/\r?\n/u).length).toBeLessThan(120);
    for (const filename of [
      'acquisitionHandlers.js',
      'documentHandlers.js',
      'readingHandlers.js',
    ]) {
      expect(existsSync(resolve(root, 'electron/main/lyrics', filename))).toBe(
        true,
      );
    }
    expect(facade).not.toContain("require('../lib/");
    expect(acquisition).not.toContain('worker_threads');
    expect(acquisition).not.toContain('importManualLyrics');
    expect(documents).not.toContain('probeMusixmatchLyrics');
    expect(documents).not.toContain('worker_threads');
    expect(readings).not.toContain('../lib/lrclib');
    expect(readings).not.toContain('../lib/musixmatch');
  });

  it('keeps player transport separate from Web Audio graph ownership', () => {
    const graphPath = resolve(
      root,
      'src/composables/player/usePlayerAudioGraph.js',
    );
    expect(existsSync(graphPath)).toBe(true);
    if (!existsSync(graphPath)) return;

    const player = read('src/composables/usePlayer.js');
    const graph = read('src/composables/player/usePlayerAudioGraph.js');

    expect(player.split(/\r?\n/u).length).toBeLessThan(600);
    expect(player).toContain("from './player/usePlayerAudioGraph.js'");
    expect(player).not.toContain('@soundtouchjs/audio-worklet');
    expect(player).not.toContain('createChannelSplitter');
    expect(graph).toContain('usePlayerAudioGraph');
    expect(graph).not.toContain("addEventListener('timeupdate'");
    expect(graph).not.toContain('endedListeners');
  });

  it('keeps the Lyrics renderer facade split by product responsibility', () => {
    const acquisitionPath = resolve(
      root,
      'src/composables/lyrics/useLyricsAcquisition.js',
    );
    const documentsPath = resolve(
      root,
      'src/composables/lyrics/useLyricsSourceDocuments.js',
    );
    expect(existsSync(acquisitionPath)).toBe(true);
    expect(existsSync(documentsPath)).toBe(true);
    if (!existsSync(acquisitionPath) || !existsSync(documentsPath)) return;

    const facade = read('src/composables/useLyrics.js');
    const acquisition = read('src/composables/lyrics/useLyricsAcquisition.js');
    const documents = read(
      'src/composables/lyrics/useLyricsSourceDocuments.js',
    );

    expect(facade.split(/\r?\n/u).length).toBeLessThan(550);
    expect(facade).toContain("from './lyrics/useLyricsAcquisition.js'");
    expect(facade).toContain("from './lyrics/useLyricsSourceDocuments.js'");
    expect(facade).not.toContain('LRCLIB_FAILURE_MESSAGES');
    expect(acquisition).not.toContain('importLyricsText');
    expect(acquisition).not.toContain('saveLyricsTiming');
    expect(documents).not.toContain('searchLyricsCandidates');
    expect(documents).not.toContain('probeMusixmatchLyrics');
    expect(documents).not.toContain('requireFeatureGate');
  });

  it('keeps Output service control separate from projection publishing', () => {
    const publisherPath = resolve(
      root,
      'src/composables/output/useOutputProjectionPublisher.js',
    );
    expect(existsSync(publisherPath)).toBe(true);
    if (!existsSync(publisherPath)) return;

    const runtime = read('src/composables/useOutputRuntime.js');
    const publisher = read(
      'src/composables/output/useOutputProjectionPublisher.js',
    );

    expect(runtime.split(/\r?\n/u).length).toBeLessThan(450);
    expect(runtime).toContain(
      "from './output/useOutputProjectionPublisher.js'",
    );
    expect(runtime).not.toContain('projectDynamicOutputState');
    expect(runtime).not.toContain('createLatestAsyncPublisher');
    expect(publisher).toContain('useOutputProjectionPublisher');
    expect(publisher).toContain('createLatestAsyncPublisher');
    expect(publisher).not.toContain('startOutput');
    expect(publisher).not.toContain('updateOutputSettings');
    expect(publisher).not.toContain('upsertOutputSlot');
  });

  it('keeps Import session state separate from resolution and execution workflows', () => {
    const resolutionPath = resolve(
      root,
      'src/composables/import/useImportSourceResolution.js',
    );
    const executionPath = resolve(
      root,
      'src/composables/import/useImportExecution.js',
    );
    expect(existsSync(resolutionPath)).toBe(true);
    expect(existsSync(executionPath)).toBe(true);
    if (!existsSync(resolutionPath) || !existsSync(executionPath)) return;

    const facade = read('src/composables/useImportSession.js');
    const resolution = read(
      'src/composables/import/useImportSourceResolution.js',
    );
    const execution = read('src/composables/import/useImportExecution.js');

    expect(facade.split(/\r?\n/u).length).toBeLessThan(430);
    expect(facade).toContain("from './import/useImportSourceResolution.js'");
    expect(facade).toContain("from './import/useImportExecution.js'");
    expect(facade).not.toContain('markRaw');
    expect(facade).not.toContain('downloadAudio');
    expect(resolution).toContain('useImportSourceResolution');
    expect(resolution).toContain('markRaw');
    expect(resolution).not.toContain('downloadAudio');
    expect(resolution).not.toContain('upsertAlbum');
    expect(execution).toContain('useImportExecution');
    expect(execution).toContain('downloadAudio');
    expect(execution).not.toContain('fetchYoutubePlaylist');
    expect(execution).not.toContain('markRaw');
    expect(resolution).not.toContain('reactive(');
    expect(execution).not.toContain('reactive(');
    expect(resolution).not.toContain('useImportExecution');
    expect(execution).not.toContain('useImportSourceResolution');
  });

  it('keeps Music Analysis session, capability, job, and batch ownership separate', () => {
    const capabilityPath = resolve(
      root,
      'src/composables/analysis/useMusicAnalysisCapability.js',
    );
    const jobPath = resolve(
      root,
      'src/composables/analysis/useMusicAnalysisJob.js',
    );
    expect(existsSync(capabilityPath)).toBe(true);
    expect(existsSync(jobPath)).toBe(true);
    if (!existsSync(capabilityPath) || !existsSync(jobPath)) return;

    const facade = read('src/composables/useMusicAnalysisWorkbench.js');
    const capability = read(
      'src/composables/analysis/useMusicAnalysisCapability.js',
    );
    const job = read('src/composables/analysis/useMusicAnalysisJob.js');

    expect(facade.split(/\r?\n/u).length).toBeLessThan(380);
    expect(facade).toContain("from './analysis/useMusicAnalysisCapability.js'");
    expect(facade).toContain("from './analysis/useMusicAnalysisJob.js'");
    expect(facade).not.toContain('CAPABILITY_STAGE_LABELS');
    expect(facade).not.toContain('normalizedProgress');
    expect(facade).not.toContain('statusPollTimer');
    expect(capability).toContain('useMusicAnalysisCapability');
    expect(capability).toContain('getMusicStructureCapabilityStatus');
    expect(capability).not.toContain('analyzeTrackMusicStructure');
    expect(capability).not.toContain('startMusicStructureBatch');
    expect(job).toContain('useMusicAnalysisJob');
    expect(job).toContain('getTrackMusicStructureAnalysisStatus');
    expect(job).not.toContain('prepareMusicStructureCapability');
    expect(job).not.toContain('startMusicStructureBatch');
    expect(capability).not.toContain('reactive(');
    expect(job).not.toContain('reactive(');
    expect(capability).not.toContain('useMusicAnalysisJob');
    expect(job).not.toContain('useMusicAnalysisCapability');
    expect(capability).not.toContain('useMusicAnalysisBatch');
    expect(job).not.toContain('useMusicAnalysisBatch');
  });

  it('keeps durable architecture guidance aligned with the composition root', () => {
    const guidance = read('AGENTS.md');
    expect(guidance).not.toContain('now ~210 lines');
    expect(guidance).not.toContain('ytdlpHandlers.js');
  });
});
