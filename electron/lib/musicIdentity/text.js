'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Provider-neutral lexical key. Provider decorations and recording-version
// terms remain visible so adapters and feature policies can interpret them.
function normalizeForCompare(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/[()[\]{}|/\\]+/gu, ' ')
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

module.exports = {
  normalizeForCompare,
  normalizeText,
};
