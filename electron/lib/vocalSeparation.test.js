import { describe, it, expect, vi } from 'vitest';
import {
  encodeWav,
  resolveExecutionPreset,
  resolvePreset,
  SEPARATION_PRESETS,
  MODELS,
  createInferenceSession,
} from './vocalSeparation.js';

// createInferenceSession's own fallback logic is pure and injectable (no
// real onnxruntime-node/model file needed), unlike separateTrack()'s full
// STFT/ONNX path above — see ADR 0017 for why this specific seam exists.
describe('createInferenceSession', () => {
  it('returns the DirectML session when creation succeeds', async () => {
    const dmlSession = { id: 'dml' };
    const createSession = vi.fn(async (_path, options) => {
      expect(options).toEqual({ executionProviders: ['dml'] });
      return dmlSession;
    });
    const onFallback = vi.fn();

    const session = await createInferenceSession('model.onnx', {
      preferGpu: true,
      createSession,
      onFallback,
    });

    expect(session).toBe(dmlSession);
    expect(onFallback).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('falls back to a CPU (no execution provider) session when DirectML creation throws', async () => {
    const cpuSession = { id: 'cpu' };
    const dmlError = new Error('no available backend found');
    const createSession = vi.fn(async (_path, options) => {
      if (options) throw dmlError;
      return cpuSession;
    });
    const onFallback = vi.fn();

    const session = await createInferenceSession('model.onnx', {
      preferGpu: true,
      createSession,
      onFallback,
    });

    expect(session).toBe(cpuSession);
    expect(onFallback).toHaveBeenCalledExactlyOnceWith(dmlError);
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it('skips DirectML entirely when preferGpu is false', async () => {
    const cpuSession = { id: 'cpu' };
    const createSession = vi.fn(async (_path, options) => {
      expect(options).toBeUndefined();
      return cpuSession;
    });
    const onFallback = vi.fn();

    const session = await createInferenceSession('model.onnx', {
      preferGpu: false,
      createSession,
      onFallback,
    });

    expect(session).toBe(cpuSession);
    expect(onFallback).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

// Only the pure, deterministic piece gets automated coverage — the
// STFT/ONNX inference path stays untested here for the same reason
// downloadAudio/fetchMetadata are: slow, needs a real ~50MB model file,
// not CI-suitable.
describe('encodeWav', () => {
  it('writes a valid RIFF/WAVE header for a 2-sample stereo clip', () => {
    const left = new Float32Array([0, 0]);
    const right = new Float32Array([0, 0]);
    const buf = encodeWav([left, right], 44100);

    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buf.toString('ascii', 12, 16)).toBe('fmt ');
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(2); // stereo
    expect(buf.readUInt32LE(24)).toBe(44100); // sample rate
    expect(buf.readUInt16LE(34)).toBe(16); // bits per sample
    expect(buf.toString('ascii', 36, 40)).toBe('data');

    const dataSize = 2 * 2 * 2; // 2 samples * 2 channels * 2 bytes
    expect(buf.readUInt32LE(40)).toBe(dataSize);
    expect(buf.readUInt32LE(4)).toBe(36 + dataSize);
    expect(buf.length).toBe(44 + dataSize);
  });

  it('encodes and interleaves left/right samples as 16-bit PCM', () => {
    const left = new Float32Array([1, -1, 0.5]);
    const right = new Float32Array([-1, 1, -0.5]);
    const buf = encodeWav([left, right], 44100);

    expect(buf.readInt16LE(44)).toBe(32767); // left[0]
    expect(buf.readInt16LE(46)).toBe(-32767); // right[0]
    expect(buf.readInt16LE(48)).toBe(-32767); // left[1]
    expect(buf.readInt16LE(50)).toBe(32767); // right[1]
    expect(buf.readInt16LE(52)).toBe(Math.round(0.5 * 32767)); // left[2]
    expect(buf.readInt16LE(54)).toBe(Math.round(-0.5 * 32767)); // right[2]
  });

  it('clamps samples outside [-1, 1] instead of wrapping/overflowing', () => {
    const left = new Float32Array([2, -5]);
    const right = new Float32Array([1.5, -1.2]);
    const buf = encodeWav([left, right], 44100);

    expect(buf.readInt16LE(44)).toBe(32767);
    expect(buf.readInt16LE(46)).toBe(32767);
    expect(buf.readInt16LE(48)).toBe(-32767);
    expect(buf.readInt16LE(50)).toBe(-32767);
  });

  // The stems.wav format (see separateTrack) is 4 channels in a fixed
  // order: instL, instR, vocL, vocR — this locks in that the header
  // reflects 4 channels and that per-frame interleaving follows the array
  // order given, not some other grouping (e.g. all of channel 0 then all
  // of channel 1).
  it('interleaves N channels in the given order for a 4-channel clip', () => {
    const instL = new Float32Array([0.1, 0.2]);
    const instR = new Float32Array([0.3, 0.4]);
    const vocL = new Float32Array([0.5, 0.6]);
    const vocR = new Float32Array([0.7, 0.8]);
    const buf = encodeWav([instL, instR, vocL, vocR], 44100);

    expect(buf.readUInt16LE(22)).toBe(4); // numChannels
    const dataSize = 2 * 4 * 2; // 2 samples * 4 channels * 2 bytes
    expect(buf.readUInt32LE(40)).toBe(dataSize);

    const expected = [0.1, 0.3, 0.5, 0.7, 0.2, 0.4, 0.6, 0.8];
    expected.forEach((value, i) => {
      expect(buf.readInt16LE(44 + i * 2)).toBe(Math.round(value * 32767));
    });
  });
});

describe('resolvePreset', () => {
  it('resolves canonical recipes through versioned processing profiles', () => {
    expect(resolvePreset('quick')).toMatchObject({
      profileId: 'mdx-kara2-v1',
      modelId: 'kara2',
    });
    expect(resolvePreset('general')).toMatchObject({
      profileId: 'mdx-inst-hq4-v1',
      modelId: 'inst-hq4',
    });
    expect(resolvePreset(undefined)).toEqual(SEPARATION_PRESETS.general);
  });

  it('resolves known preset ids to their params', () => {
    expect(resolvePreset('quick')).toEqual(SEPARATION_PRESETS.quick);
    expect(resolvePreset('general')).toEqual(SEPARATION_PRESETS.general);
    expect(resolvePreset('high-quality')).toEqual(
      SEPARATION_PRESETS['high-quality'],
    );
  });

  it('keeps old direct worker ids as execution aliases', () => {
    expect(resolvePreset('standard')).toEqual(SEPARATION_PRESETS.quick);
    expect(resolvePreset('clean')).toEqual(SEPARATION_PRESETS.general);
    expect(resolvePreset('inst-hq3')).toEqual(
      SEPARATION_PRESETS['benchmark-hq3'],
    );
  });

  it('falls back to the general preset for an unknown or missing id', () => {
    expect(resolvePreset('does-not-exist')).toEqual(SEPARATION_PRESETS.general);
    expect(resolvePreset(undefined)).toEqual(SEPARATION_PRESETS.general);
  });

  // quick is meant to be the literal upstream-default KARA2 profile — guards
  // against silently drifting back to denoise: true.
  it('quick mirrors the verified upstream default params exactly', () => {
    expect(SEPARATION_PRESETS.quick).toEqual({
      profileId: 'mdx-kara2-v1',
      modelId: 'kara2',
      overlap: 0.25,
      enableDenoise: false,
    });
  });

  it('promotes pinned Inst HQ4 to general and keeps HQ3 benchmark-only', () => {
    expect(MODELS['inst-hq4']).toEqual({
      filename: 'UVR-MDX-NET-Inst_HQ_4.onnx',
      nFft: 5120,
      dimF: 2560,
      dimT: 256,
      compensate: 1.019,
      primaryStem: 'instrumental',
    });
    expect(SEPARATION_PRESETS.general).toEqual({
      profileId: 'mdx-inst-hq4-v1',
      modelId: 'inst-hq4',
      overlap: 0.25,
      enableDenoise: true,
    });
    expect(SEPARATION_PRESETS['benchmark-hq3']).toEqual({
      profileId: 'mdx-inst-hq3-v1',
      modelId: 'inst-hq3',
      overlap: 0.25,
      enableDenoise: true,
    });
  });
});

describe('resolveExecutionPreset', () => {
  it('accepts a recipe only when its resolved profile and model agree', () => {
    expect(
      resolveExecutionPreset('general', 'mdx-inst-hq4-v1', 'inst-hq4'),
    ).toEqual(SEPARATION_PRESETS.general);
  });

  it('fails before inference when recipe provenance drifts', () => {
    expect(() =>
      resolveExecutionPreset('general', 'mdx-kara2-v1', 'inst-hq4'),
    ).toThrow(/profile/i);
    expect(() =>
      resolveExecutionPreset('general', 'mdx-inst-hq4-v1', 'kara2'),
    ).toThrow(/model/i);
  });

  it('rejects a presetId outside the safe filename charset before it can reach the output path', () => {
    // presetId is interpolated straight into `${presetId}.wav`; an
    // unvalidated value like this would otherwise let separateTrack write
    // outside outputDir.
    expect(() =>
      resolveExecutionPreset('../../evil', undefined, undefined),
    ).toThrow(/invalid separation preset id/i);
  });
});

// Cheap consistency checks that would otherwise only surface as a runtime
// crash mid-separation (unknown modelId) or a silently corrupted stems.wav
// (a vocals-primary model shipped without updating the channel-order
// mapping in separateTrack — see its primaryStem guard).
describe('MODELS / SEPARATION_PRESETS consistency', () => {
  it('every preset references a model that exists in the registry', () => {
    for (const preset of Object.values(SEPARATION_PRESETS)) {
      expect(MODELS[preset.modelId]).toBeDefined();
    }
  });

  it('every registered model is instrumental-primary', () => {
    for (const model of Object.values(MODELS)) {
      expect(model.primaryStem).toBe('instrumental');
    }
  });
});
