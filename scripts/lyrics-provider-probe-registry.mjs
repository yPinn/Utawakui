function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

export const FIXED_LYRICS_PROVIDER_DESCRIPTORS = Object.freeze([
  Object.freeze({
    id: 'lrclib',
    mode: 'baseline',
    profileId: 'lrclib-http-v1',
    accessMode: 'none',
    tokenRefresh: 'not-required',
    boundedPayload: true,
  }),
  Object.freeze({
    id: 'kugou',
    mode: 'candidate',
    profileId: 'kugou-direct-lrc-evaluation-v1',
    accessMode: 'none',
    tokenRefresh: 'not-required',
    boundedPayload: true,
  }),
]);

export function createLyricsProviderProbeRegistry(value) {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.lrclib !== 'function' ||
    typeof value.kugou !== 'function'
  ) {
    throw new TypeError('fixed lyrics provider probe registry is invalid');
  }
  return Object.freeze({ lrclib: value.lrclib, kugou: value.kugou });
}

export function createDefaultLyricsProviderProbeRegistry() {
  return createLyricsProviderProbeRegistry({
    lrclib: createLrclibEvaluationProbe(),
    kugou: createKugouLineEvaluationProbe(),
  });
}
import { createKugouLineEvaluationProbe } from './lyrics-provider-kugou.mjs';
import { createLrclibEvaluationProbe } from './lyrics-provider-lrclib.mjs';
