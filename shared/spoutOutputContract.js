'use strict';

const values = require('./spoutOutputValues.json');

const SPOUT_CONTRACT_VERSION = values.contractVersion;
const SPOUT_HELPER_ARGUMENT = values.helperArgument;
const SPOUT_DEFAULT_FRAME_RATE_PROFILE = values.defaultFrameRateProfile;
const SPOUT_FRAME_RATE_PROFILES = Object.freeze({
  ...values.frameRateProfiles,
});
const SPOUT_LYRICS_SURFACE = Object.freeze({ ...values.surface });
const SPOUT_ERROR_CODES = new Set([
  'SPOUT_HELPER_INTERNAL',
  'SPOUT_NATIVE_MODULE_UNAVAILABLE',
  'SPOUT_RENDERER_LOAD_FAILED',
  'SPOUT_RENDERER_FAILED',
  'SPOUT_SENDER_NAME_IN_USE',
  'SPOUT_SHARED_TEXTURE_UNAVAILABLE',
  'SPOUT_SURFACE_INVALID',
  'SPOUT_TEXTURE_SEND_FAILED',
]);

function isSpoutFrameRateProfile(value) {
  return (
    typeof value === 'string' && Object.hasOwn(SPOUT_FRAME_RATE_PROFILES, value)
  );
}

function getSpoutLyricsSurface(
  frameRateProfile = SPOUT_DEFAULT_FRAME_RATE_PROFILE,
) {
  if (!isSpoutFrameRateProfile(frameRateProfile)) {
    throw new Error('Spout frame-rate profile unavailable');
  }
  return Object.freeze({
    ...SPOUT_LYRICS_SURFACE,
    framesPerSecond: SPOUT_FRAME_RATE_PROFILES[frameRateProfile],
  });
}

function normalizeSpoutSurface(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== Object.keys(SPOUT_LYRICS_SURFACE).length) {
    return null;
  }
  const profile = Object.entries(SPOUT_FRAME_RATE_PROFILES).find(
    ([, framesPerSecond]) => value.framesPerSecond === framesPerSecond,
  );
  if (!profile) return null;
  const surface = getSpoutLyricsSurface(profile[0]);
  return Object.entries(surface).every(
    ([key, expected]) => value[key] === expected,
  )
    ? surface
    : null;
}

function isExactSurface(value) {
  return Boolean(normalizeSpoutSurface(value));
}

function normalizeOutputBaseUrl(status) {
  if (status?.running !== true || typeof status.httpUrl !== 'string') {
    throw new Error('Spout output endpoint unavailable');
  }

  let url;
  try {
    url = new URL(status.httpUrl);
  } catch {
    throw new Error('Spout output endpoint unavailable');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Spout output endpoint unavailable');
  }
  return url;
}

function createSpoutConfigureMessage(
  status,
  frameRateProfile = SPOUT_DEFAULT_FRAME_RATE_PROFILE,
) {
  const baseUrl = normalizeOutputBaseUrl(status);
  return {
    contractVersion: SPOUT_CONTRACT_VERSION,
    type: 'configure',
    outputUrl: new URL('/overlay/lyrics', baseUrl).toString(),
    surface: getSpoutLyricsSurface(frameRateProfile),
  };
}

function isSpoutConfigureMessage(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.contractVersion !== SPOUT_CONTRACT_VERSION ||
    value.type !== 'configure' ||
    typeof value.outputUrl !== 'string' ||
    !isExactSurface(value.surface) ||
    Object.keys(value).length !== 4
  ) {
    return false;
  }

  try {
    const url = new URL(value.outputUrl);
    return Boolean(
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      !url.username &&
      !url.password &&
      url.pathname === '/overlay/lyrics' &&
      !url.search &&
      !url.hash,
    );
  } catch {
    return false;
  }
}

function isSpoutStopMessage(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.contractVersion === SPOUT_CONTRACT_VERSION &&
    value.type === 'stop' &&
    Object.keys(value).length === 2,
  );
}

function normalizeSpoutHelperEvent(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.contractVersion !== SPOUT_CONTRACT_VERSION
  ) {
    return null;
  }
  if (value.type === 'ready' && isExactSurface(value.surface)) {
    return {
      contractVersion: SPOUT_CONTRACT_VERSION,
      type: 'ready',
      surface: normalizeSpoutSurface(value.surface),
    };
  }
  if (
    value.type === 'error' &&
    typeof value.code === 'string' &&
    SPOUT_ERROR_CODES.has(value.code)
  ) {
    return {
      contractVersion: SPOUT_CONTRACT_VERSION,
      type: 'error',
      code: value.code,
    };
  }
  return null;
}

module.exports = {
  SPOUT_CONTRACT_VERSION,
  SPOUT_DEFAULT_FRAME_RATE_PROFILE,
  SPOUT_ERROR_CODES,
  SPOUT_FRAME_RATE_PROFILES,
  SPOUT_HELPER_ARGUMENT,
  SPOUT_LYRICS_SURFACE,
  createSpoutConfigureMessage,
  getSpoutLyricsSurface,
  isSpoutConfigureMessage,
  isSpoutFrameRateProfile,
  isSpoutStopMessage,
  normalizeSpoutHelperEvent,
};
