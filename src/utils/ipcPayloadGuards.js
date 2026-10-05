// Renderer-side checks for main-pushed IPC payloads (queue/batch snapshots).

export function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

export function safeId(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !hasControlCharacters(value)
  );
}

export function boundedCount(value, total) {
  return Number.isSafeInteger(value) && value >= 0 && value <= total;
}
