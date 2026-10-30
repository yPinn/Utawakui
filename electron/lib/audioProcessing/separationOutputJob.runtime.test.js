import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { encodeWav } from '../vocalSeparation.js';
import {
  loadSeparationManifest,
  recordSeparationResult,
  resolveSeparationResultPath,
} from '../library/separationManifest.js';
import { createSeparationOutputJob } from './separationOutputJob.js';
import { createHeavyJobScheduler } from './heavyJobScheduler.js';
import { registerSeparationHandlers } from '../../main/separationHandlers.js';
import { createFfmpegFlacTranscodeJob } from './ffmpegFlacTranscodeJob.js';
import { buildRangeResponse } from '../library/range.js';

const ffmpegPath = process.env.UTAWAKUI_TEST_FFMPEG;
const metadata = {
  recipeId: 'general',
  recipeVersion: 1,
  engineId: 'onnx-mdx',
  profileId: 'mdx-inst-hq4-v1',
  modelIds: ['inst-hq4'],
  artifactFilename: 'general.wav',
  completedAt: '2026-10-30',
  outputLayout: 'accompaniment-guide-4ch',
};
const wav = () =>
  encodeWav(
    Array.from({ length: 4 }, (_, ch) =>
      Float32Array.from(
        { length: 22050 },
        (_, i) => 0.2 * Math.sin((2 * Math.PI * (311 + ch * 157) * i) / 44100),
      ),
    ),
    44100,
  );
const worker = ({ workerData }) => {
  fs.mkdirSync(workerData.outputDir, { recursive: true });
  fs.writeFileSync(path.join(workerData.outputDir, 'general.wav'), wav());
  recordSeparationResult(workerData.outputDir, metadata);
  return {
    result: Promise.resolve({
      stemsPath: path.join(workerData.outputDir, 'general.wav'),
    }),
    cancel: async () => {},
  };
};

describe.skipIf(!ffmpegPath)(
  'real FFmpeg / stub inference output transaction',
  () => {
    it('validates all four PCM channels through real encoding and decoding', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-flac-real-'));
      try {
        const result = await createSeparationOutputJob({
          workerData: {
            outputDir: dir,
            recipeId: 'general',
            profileId: metadata.profileId,
            modelId: 'inst-hq4',
            ffmpegPath,
          },
          createWorkerJob: worker,
        }).result;
        expect(result.outputFormat).toBe('flac5');
        const bytes = fs.readFileSync(result.stemsPath);
        const response = buildRangeResponse(result.stemsPath, 'bytes=7-70');
        expect(response.status).toBe(206);
        expect(response.headers.get('Content-Type')).toBe('audio/flac');
        expect(response.headers.get('Content-Range')).toBe(
          `bytes 7-70/${bytes.length}`,
        );
        expect(Buffer.from(await response.arrayBuffer())).toEqual(
          bytes.subarray(7, 71),
        );
        expect(
          fs.readFileSync(result.stemsPath).subarray(0, 4).toString(),
        ).toBe('fLaC');
        expect(
          loadSeparationManifest(dir).results.general.artifactFilename,
        ).toBe(result.artifactFilename);
        expect(fs.readdirSync(dir).sort()).toEqual(
          [result.artifactFilename, 'manifest.json'].sort(),
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('falls back to new WAV when a real encode output is corrupted', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-flac-corrupt-'));
      try {
        const result = await createSeparationOutputJob({
          workerData: {
            outputDir: dir,
            recipeId: 'general',
            profileId: metadata.profileId,
            modelId: 'inst-hq4',
            ffmpegPath,
          },
          createWorkerJob: worker,
          createTranscodeJob: (options) => {
            const job = createFfmpegFlacTranscodeJob(options);
            return {
              ...job,
              result: job.result.then(() => {
                const b = fs.readFileSync(options.outputPath);
                fs.writeFileSync(options.outputPath, b.subarray(0, 42));
              }),
            };
          },
        }).result;
        expect(result).toMatchObject({
          outputFormat: 'wav',
          fallbackReason: 'flac-unavailable',
        });
        expect(fs.readFileSync(result.stemsPath)).toEqual(wav());
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('runs queue/service/scheduler/controlled Main factory and serves recorded FLAC', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-flac-main-')),
        output = path.join(dir, 'tracks', 'new', 'separations');
      const handlers = new Map(),
        scheduler = createHeavyJobScheduler();
      try {
        registerSeparationHandlers({
          ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
          getConfig: () => ({}),
          resolveDownloadDir: () => dir,
          resolveUserDataDir: () => dir,
          getMainWindow: () => null,
          notifyLibraryUpdated: vi.fn(),
          requireFeatureGate: vi.fn(),
          featureIds: { AUDIO_PROCESSING_FLOW: 'audio-processing-flow' },
          heavyJobScheduler: scheduler,
          recordDiagnostic: vi.fn(),
          allowFlacOutput: true,
          findSeparationTrackRecord: () => ({ id: 'new' }),
          resolveSeparationsOutputDir: () => output,
          resolveSeparationInputAudioPath: () => path.join(dir, 'source.wav'),
          getPreparedSeparationFfmpegPath: () => ffmpegPath,
          getPreparedSeparationModel: () => path.join(dir, 'model.onnx'),
          createSeparationEngineJob: worker,
        });
        const result = await handlers.get('separation:run')(
          null,
          'new',
          'general',
          'flac5',
        );
        const filename =
          loadSeparationManifest(output).results.general.artifactFilename;
        expect(result.stemsUrl).toBe(
          `utawakui-media://track/new/separations/${filename}`,
        );
        expect(filename.endsWith('.flac')).toBe(true);
        expect(resolveSeparationResultPath(dir, 'new', filename)).toBe(
          path.join(output, filename),
        );
      } finally {
        await scheduler.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);
