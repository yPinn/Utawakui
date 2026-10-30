import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { readLocaleCatalogs } from '../../electron/lib/localeCatalogs.js';

const root = path.resolve(import.meta.dirname, '../..');
const catalog = readLocaleCatalogs()['zh-TW'];

function messageKeys(messages, prefix = '') {
  return Object.entries(messages).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? messageKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : sourceFiles(file);
    return /\.(?:c?js|mjs|vue)$/u.test(entry.name) &&
      !/\.test\.[cm]?js$/u.test(entry.name)
      ? [file]
      : [];
  });
}

// String literals inside each t(...) call, including ternary arguments.
function translationKeys(source) {
  const keys = [];
  for (const call of source.matchAll(/\bt\(/gu)) {
    let depth = 1;
    let end = call.index + call[0].length;
    while (end < source.length && depth > 0) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')') depth -= 1;
      end += 1;
    }
    const args = source.slice(call.index + call[0].length, end - 1);
    for (const literal of args.matchAll(
      /['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]/gu,
    ))
      keys.push(literal[1]);
  }
  return keys;
}

describe('UI catalog usage', () => {
  it('resolves every catalog key referenced by main and renderer code', () => {
    const known = new Set(messageKeys(catalog));
    const unknown = ['src', 'electron'].flatMap((directory) =>
      sourceFiles(path.join(root, directory)).flatMap((file) =>
        translationKeys(fs.readFileSync(file, 'utf8'))
          .filter((key) => !known.has(key))
          .map((key) => `${path.relative(root, file)}: ${key}`),
      ),
    );
    expect(unknown).toEqual([]);
  });
});
