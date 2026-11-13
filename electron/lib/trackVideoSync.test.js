import { expect, it } from 'vitest';
import { samplesFrom } from './trackVideoSync.js';
import { estimateVideoAlignment } from './trackVideoSyncWorker.js';

it('reads decoded samples from a buffer at any byte offset', () => {
  const bytes = Buffer.from(new Float32Array([0.25, -0.5]).buffer);
  const shifted = Buffer.alloc(bytes.length + 1);
  bytes.copy(shifted, 1);
  expect(Array.from(samplesFrom(shifted.subarray(1)))).toEqual([0.25, -0.5]);
  expect(samplesFrom(Buffer.alloc(6))).toBeNull();
});

const rate = 4000;

function signal(seconds, seed = 123456) {
  return Float32Array.from({ length: seconds * rate }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  });
}

function concatenate(...clips) {
  const result = new Float32Array(
    clips.reduce((size, clip) => size + clip.length, 0),
  );
  let at = 0;
  for (const clip of clips) {
    result.set(clip, at);
    at += clip.length;
  }
  return result;
}

it('estimates the offset of the same recording with a longer introduction and different gain', async () => {
  const source = signal(22);
  const target = concatenate(
    signal(2, 1),
    source.map((x) => 0.6 * x),
    signal(1, 2),
  );
  expect(await estimateVideoAlignment(source, target)).toEqual({
    offsetMs: 2000,
    segments: null,
    autoApply: true,
  });
});

it('keeps a consistent offset through brief mismatches in otherwise matching audio', async () => {
  const source = signal(80);
  const videoAudio = source.slice();
  videoAudio.set(signal(1, 1), 0);
  videoAudio.set(signal(1, 2), 36 * rate);
  videoAudio.set(signal(1.5, 3), 78.5 * rate);
  const target = concatenate(signal(2, 4), videoAudio);
  expect(await estimateVideoAlignment(source, target)).toEqual({
    offsetMs: 2000,
    segments: null,
    autoApply: true,
  });
});

it('offers the matching offset for review when only the ending differs', async () => {
  const source = signal(80);
  const videoAudio = source.slice();
  videoAudio.set(signal(4, 1), 76 * rate);
  const target = concatenate(signal(2, 2), videoAudio);
  expect(await estimateVideoAlignment(source, target)).toEqual({
    offsetMs: 2000,
    segments: null,
    autoApply: false,
    reviewRange: { startMs: 76000, endMs: 80000 },
  });
});

it('rejects recurring short mismatches that leave too little verified coverage', async () => {
  const source = signal(80);
  const target = source.slice();
  for (const start of [0, 8, 16, 24, 32, 40, 48, 56, 64, 72]) {
    target.set(signal(1, start), start * rate);
  }
  expect(await estimateVideoAlignment(source, target)).toBeNull();
});

it('rejects a middle edit instead of applying the offset of the longest segment', async () => {
  const source = signal(24);
  const at = 10 * rate;
  const target = concatenate(
    source.subarray(0, at),
    signal(1, 2),
    source.subarray(at),
  );
  expect(await estimateVideoAlignment(source, target)).toMatchObject({
    segments: [{ offsetMs: 0 }, { offsetMs: 1000 }],
  });
});

it('matches both sides of a longer video interlude and leaves missing source audio unmapped', async () => {
  const source = signal(24);
  const target = concatenate(
    signal(1, 2),
    source.subarray(0, 12 * rate),
    signal(4, 3),
    source.subarray(14 * rate),
  );
  expect(await estimateVideoAlignment(source, target)).toEqual({
    offsetMs: 1000,
    autoApply: true,
    segments: [
      { startMs: 0, endMs: 12000, offsetMs: 1000 },
      { startMs: 14000, endMs: 24000, offsetMs: 3000 },
    ],
  });
});

it.each([
  [30, 4],
  [70, 6],
])(
  'offers segments for review with a %i-second source and a %i-second gap',
  async (duration, gap) => {
    const source = signal(duration);
    const middle = (duration / 2) * rate;
    const target = concatenate(
      signal(1, 2),
      source.subarray(0, middle),
      signal(gap + 2, 3),
      source.subarray(middle + gap * rate),
    );
    expect(await estimateVideoAlignment(source, target)).toEqual({
      offsetMs: 1000,
      autoApply: false,
      segments: [
        { startMs: 0, endMs: (duration / 2) * 1000, offsetMs: 1000 },
        {
          startMs: (duration / 2 + gap) * 1000,
          endMs: duration * 1000,
          offsetMs: 3000,
        },
      ],
    });
  },
);

it('rejects ambiguous repeats and an unrelated track', async () => {
  const source = signal(12);
  expect(
    await estimateVideoAlignment(source, concatenate(source, source)),
  ).toBeNull();
  expect(await estimateVideoAlignment(source, signal(12, 1))).toBeNull();
});

it('allows cancellation during the search', async () => {
  const source = signal(12);
  const controller = new AbortController();
  const analysis = estimateVideoAlignment(source, source, controller.signal);
  controller.abort();
  await expect(analysis).rejects.toMatchObject({ name: 'AbortError' });
});
