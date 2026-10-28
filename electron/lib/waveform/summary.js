'use strict';
function validateSummary(value) {
  const p = value?.peaks;
  const exact = (object, fields) =>
    object &&
    typeof object === 'object' &&
    Object.keys(object).length === fields.length &&
    fields.every((field) => Object.hasOwn(object, field));
  if (
    !exact(value, [
      'producerVersion',
      'sampleRate',
      'channels',
      'frames',
      'durationSec',
      'peaks',
    ]) ||
    !exact(p, ['startFrame', 'endFrame', 'strideFrames', 'min', 'max']) ||
    value?.producerVersion !== 'channel-extrema-v1' ||
    !Number.isInteger(value.sampleRate) ||
    value.sampleRate < 8000 ||
    value.sampleRate > 192000 ||
    !Number.isInteger(value.channels) ||
    value.channels < 1 ||
    value.channels > 8 ||
    !Number.isSafeInteger(value.frames) ||
    value.frames < 1 ||
    value.frames > 1800.25 * value.sampleRate ||
    value.durationSec !== value.frames / value.sampleRate ||
    !p ||
    !(p.min instanceof Float32Array) ||
    !(p.max instanceof Float32Array) ||
    ![4096, 8192].includes(p.min.length) ||
    p.min.length !== p.max.length ||
    !Number.isInteger(p.startFrame) ||
    p.startFrame < 0 ||
    !Number.isInteger(p.endFrame) ||
    p.endFrame <= p.startFrame ||
    p.endFrame > 1800.25 * value.sampleRate ||
    !Number.isInteger(p.strideFrames) ||
    p.strideFrames < 1 ||
    p.strideFrames !==
      Math.max(1, Math.ceil((p.endFrame - p.startFrame) / p.min.length)) ||
    p.min.some(
      (v, i) =>
        !Number.isFinite(v) || !Number.isFinite(p.max[i]) || v > p.max[i],
    )
  )
    throw Error('PAYLOAD');
  return value;
}
module.exports = { validateSummary };
