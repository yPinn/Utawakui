export const LIMITS = Object.freeze({
  durationSec: 1800,
  channels: 8,
  sampleRate: 192000,
  inputBytes: 1024 ** 3,
  browserBudgetBytes: 256 * 1024 ** 2,
  mainBudgetBytes: 256 * 1024 ** 2,
  hostLoopMs: 50,
  decoderReserveBytes: 64 * 1024 ** 2,
  coarseBuckets: 4096,
  detailBuckets: 8192,
  summaryBytes: 64 * 1024,
  pcmChunkBytes: 256 * 1024,
  deadlineMs: 30000,
  cancelMs: 1000,
});

export function validateMetadata(value) {
  const { durationSec, sampleRate, channels, inputBytes } = value;
  if (
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    durationSec > LIMITS.durationSec ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > LIMITS.sampleRate ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > LIMITS.channels ||
    !Number.isSafeInteger(inputBytes) ||
    inputBytes < 1 ||
    inputBytes > LIMITS.inputBytes
  )
    throw Error('METADATA_BUDGET');
  return { durationSec, sampleRate, channels, inputBytes };
}

export function browserAdmission(metadata) {
  const meta = validateMetadata(metadata);
  const pcmBytes =
    Math.ceil(meta.durationSec * meta.sampleRate) * meta.channels * 4;
  const reservedBytes =
    meta.inputBytes + pcmBytes * 2 + LIMITS.decoderReserveBytes;
  return {
    admitted: reservedBytes <= LIMITS.browserBudgetBytes,
    pcmBytes,
    reservedBytes,
  };
}
