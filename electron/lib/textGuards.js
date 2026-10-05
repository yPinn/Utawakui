'use strict';

// C0 controls and DEL; IPC/persisted labels and ids must not carry them.
function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

module.exports = { hasControlCharacters };
