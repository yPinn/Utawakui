import { LIMITS, PRODUCER_VERSION, validateMetadata } from './policy.mjs';

function summary(count, startFrame, frames, endFrame) {
  return {
    startFrame,
    endFrame,
    strideFrames: Math.max(1, Math.ceil(frames / count)),
    min: new Float32Array(count).fill(Infinity),
    max: new Float32Array(count).fill(-Infinity),
    energy: new Float64Array(count),
  };
}
function update(target, frame, min, max, meanSquare) {
  if (frame < target.startFrame || frame >= target.endFrame) return;
  const index = Math.floor((frame - target.startFrame) / target.strideFrames);
  if (min < target.min[index]) target.min[index] = min;
  if (max > target.max[index]) target.max[index] = max;
  target.energy[index] += meanSquare;
}
export class PeakAccumulator {
  constructor(
    metadata,
    { detailStartSec = Math.max(0, metadata.durationSec / 2 - 5) } = {},
  ) {
    this.metadata = validateMetadata(metadata);
    this.frames = 0;
    this.maxFrames = Math.ceil(
      (metadata.durationSec + 0.25) * metadata.sampleRate,
    );
    this.coarse = summary(
      LIMITS.coarseBuckets,
      0,
      this.maxFrames,
      this.maxFrames,
    );
    const start = Math.floor(detailStartSec * metadata.sampleRate);
    const end = Math.min(
      this.maxFrames,
      start +
        Math.ceil(Math.min(10, metadata.durationSec) * metadata.sampleRate),
    );
    this.detail = summary(LIMITS.detailBuckets, start, end - start, end);
  }
  record(min, max, meanSquare) {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(meanSquare)
    )
      throw Error('PCM_SAMPLE');
    if (this.frames >= this.maxFrames) throw Error('PCM_DURATION');
    update(this.coarse, this.frames, min, max, meanSquare);
    update(this.detail, this.frames, min, max, meanSquare);
    this.frames++;
  }
  pushInterleaved(view) {
    if (view.byteLength > LIMITS.pcmChunkBytes) throw Error('PCM_CHUNK');
    const frameBytes = this.metadata.channels * 4;
    if (view.byteLength % frameBytes) throw Error('PCM_FRAME');
    for (let offset = 0; offset < view.byteLength; offset += frameBytes) {
      let min = Infinity,
        max = -Infinity,
        squares = 0;
      for (let channel = 0; channel < this.metadata.channels; channel++) {
        const value = view.getFloat32(offset + channel * 4, true);
        if (!Number.isFinite(value)) throw Error('PCM_SAMPLE');
        min = Math.min(min, value);
        max = Math.max(max, value);
        squares += value * value;
      }
      this.record(min, max, squares / this.metadata.channels);
    }
  }
  pushPlanar(channels, from, count) {
    if (
      channels.length !== this.metadata.channels ||
      channels.some((channel) => channel.length < from + count) ||
      count * channels.length * 4 > LIMITS.pcmChunkBytes
    )
      throw Error('PCM_FRAME');
    for (let frame = from; frame < from + count; frame++) {
      let min = Infinity,
        max = -Infinity,
        squares = 0;
      for (const channel of channels) {
        const value = channel[frame];
        if (!Number.isFinite(value)) throw Error('PCM_SAMPLE');
        min = Math.min(min, value);
        max = Math.max(max, value);
        squares += value * value;
      }
      this.record(min, max, squares / this.metadata.channels);
    }
  }
  finish() {
    if (
      !this.frames ||
      Math.abs(
        this.frames / this.metadata.sampleRate - this.metadata.durationSec,
      ) > 0.25
    )
      throw Error('PCM_DURATION');
    for (const target of [this.coarse, this.detail]) {
      target.rms = new Float32Array(target.min.length);
      for (let i = 0; i < target.min.length; i++) {
        if (!Number.isFinite(target.min[i])) target.min[i] = target.max[i] = 0;
        const count = Math.max(
          0,
          Math.min(
            target.strideFrames,
            this.frames - target.startFrame - i * target.strideFrames,
            target.endFrame - target.startFrame - i * target.strideFrames,
          ),
        );
        if (count) target.rms[i] = Math.sqrt(target.energy[i] / count);
      }
      delete target.energy;
    }
    const bytes = (target) =>
      target.min.byteLength + target.max.byteLength + target.rms.byteLength;
    return {
      producerVersion: PRODUCER_VERSION,
      sampleRate: this.metadata.sampleRate,
      channels: this.metadata.channels,
      frames: this.frames,
      durationSec: this.frames / this.metadata.sampleRate,
      coarse: this.coarse,
      detail: this.detail,
      payloadBytes: Math.max(bytes(this.coarse), bytes(this.detail)),
      workingSummaryBytes: bytes(this.coarse) + bytes(this.detail),
    };
  }
}
