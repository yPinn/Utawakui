'use strict';

// C0 controls and DEL; IPC/persisted labels and ids must not carry them.
function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function hasControlCharactersExceptLineBreaks(value) {
  return hasControlCharacters(value.replace(/\r?\n/g, ''));
}

// Lexical containment does not reject NTFS alternate streams, DOS devices or
// trailing-dot/space aliases. Apply this to individual Windows path segments.
function isSafeWindowsFilename(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (hasControlCharacters(value) || /[<>:"/\\|?*]/u.test(value)) return false;
  if (/[. ]$/u.test(value)) return false;
  const basename = value.split('.', 1)[0].trimEnd();
  return !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/iu.test(basename);
}

module.exports = {
  hasControlCharacters,
  hasControlCharactersExceptLineBreaks,
  isSafeWindowsFilename,
};
