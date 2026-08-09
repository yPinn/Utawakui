import { describe, it, expect } from 'vitest';
import { encodeWav } from './vocalSeparation.js';

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
