import { expect, it } from 'vitest';
import {
  alignedOfflineVocalFrames,
  createAlignedVocalInput,
  readAlignedVocalWav,
} from './alignedVocalInput.js';

it('uses audio samples and leaves quiet regions blank on the song clock', () => {
  const sampleRate = 48_000;
  const samples = new Float32Array(sampleRate);
  for (let index = sampleRate / 2; index < samples.length; index++) {
    samples[index] =
      0.04 * Math.sin((2 * Math.PI * 293.665 * index) / sampleRate);
  }
  const frames = createAlignedVocalInput(samples)(0, 0.9);
  expect(
    frames.filter(({ time }) => time < 0.5).every(({ hz }) => hz === null),
  ).toBe(true);
  for (const { hz } of frames.filter(({ time }) => time > 0.6)) {
    expect(hz).toBeCloseTo(293.665, 0);
  }
  expect(frames.at(-1).time).toBeLessThanOrEqual(0.9);
  expect(createAlignedVocalInput(samples)(1.1, 1.5)).toEqual([]);
});

it('reads an aligned mono WAV with a metadata chunk and rejects invalid formats', async () => {
  const samples = 16_000;
  const wav = new ArrayBuffer(56 + 2 * samples);
  const view = new DataView(wav);
  const tag = (offset, text) => {
    for (let index = 0; index < text.length; index++) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  tag(0, 'RIFF');
  view.setUint32(4, wav.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, samples, true);
  view.setUint32(28, 2 * samples, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'JUNK');
  view.setUint32(40, 3, true);
  tag(48, 'data');
  view.setUint32(52, 2 * samples, true);
  for (let index = 0; index < samples; index++) {
    const value = Math.sin((2 * Math.PI * 440 * index) / samples);
    if (index >= samples / 8 && index < (samples * 7) / 8)
      view.setInt16(56 + 2 * index, Math.round(value * 1200), true);
  }
  const { range, frames, offlineSamples } = readAlignedVocalWav(wav);
  expect(range.start).toBeCloseTo(0.125, 3);
  expect(range.end).toBeCloseTo(0.875, 3);
  expect(frames(0.25, 0.4).every(({ hz }) => Math.abs(hz - 440) < 1)).toBe(
    true,
  );
  const pcm = await offlineSamples();
  expect(pcm).toHaveLength(samples);
  expect(pcm[2009]).toBe(view.getInt16(56 + 2 * 2009, true) / 32768);
  expect(() => readAlignedVocalWav(wav.slice(0, -1))).toThrow();
  new Uint8Array(wav, 56).fill(0);
  expect(readAlignedVocalWav(wav).range).toBeNull();
  view.setUint16(22, 2, true);
  expect(() => readAlignedVocalWav(wav)).toThrow();
});

it('keeps offline pitches and gaps on their original file time after seeking', () => {
  const pitches = Float32Array.of(0, 392.75, 0, 384.125, 0, 440);
  expect(alignedOfflineVocalFrames(pitches, 0.013, 0.056)).toEqual([
    { time: 0.016, hz: 392.75, continuous: false },
    { time: 0.032, hz: null, continuous: true },
    { time: 0.048, hz: 384.125, continuous: true },
  ]);
  expect(alignedOfflineVocalFrames(pitches, 0.081, 3)).toEqual([]);
});
