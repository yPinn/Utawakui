export const PERFORMANCE_SETTINGS_DEFAULTS = Object.freeze({
  transposeSemitones: 0,
  pitchCents: 0,
  tempoRate: 1,
  monitorGuideVocalEnabled: true,
});
export const PERFORMANCE_SETTINGS_FIELDS = Object.freeze(
  Object.keys(PERFORMANCE_SETTINGS_DEFAULTS),
);
export const PERFORMANCE_SETTINGS_SLOT_COUNT = 3;
export const validPerformanceSlot = (slot) =>
  Number.isInteger(slot) &&
  slot >= 1 &&
  slot <= PERFORMANCE_SETTINGS_SLOT_COUNT;

export function validPerformanceSettings(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).length === 4 &&
    PERFORMANCE_SETTINGS_FIELDS.every((key) => Object.hasOwn(value, key)) &&
    Number.isInteger(value.transposeSemitones) &&
    value.transposeSemitones >= -12 &&
    value.transposeSemitones <= 12 &&
    Number.isInteger(value.pitchCents) &&
    value.pitchCents >= -50 &&
    value.pitchCents <= 50 &&
    Number.isFinite(value.tempoRate) &&
    value.tempoRate >= 0.5 &&
    value.tempoRate <= 1.5 &&
    Math.abs(value.tempoRate * 20 - Math.round(value.tempoRate * 20)) < 1e-8 &&
    typeof value.monitorGuideVocalEnabled === 'boolean',
  );
}
