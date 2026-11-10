export function isSeparationBackend(value) {
  return value === 'directml' || value === 'cpu' || value === 'cpu-fallback';
}
