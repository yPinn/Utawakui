import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const sources = filesUnder(resolve(root, 'src'))
  .filter((path) => /\.(vue|css|js)$/u.test(path) && !/\.test\.js$/u.test(path))
  .map((path) => ({
    file: relative(root, path).replaceAll('\\', '/'),
    source: readFileSync(path, 'utf8'),
  }));

describe('renderer token references', () => {
  it('defines every --ui-* custom property that any renderer source reads', () => {
    const defined = new Set(
      sources.flatMap(({ source }) => [
        // CSS declarations, JS style keys and setProperty calls.
        ...[...source.matchAll(/(--ui-[\w-]+)\s*:/gu)].map(([, name]) => name),
        ...[...source.matchAll(/['"`](--ui-[\w-]+)['"`]/gu)].map(
          ([, name]) => name,
        ),
      ]),
    );
    const undefinedReferences = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/var\(\s*(--ui-[\w-]+)/gu)]
        .map(([, name]) => name)
        // A trailing dash marks a JS template that composes the final name.
        .filter((name) => !name.endsWith('-') && !defined.has(name))
        .map((name) => `${file} -> ${name}`),
    );

    expect(defined.size).toBeGreaterThan(500);
    expect([...new Set(undefinedReferences)]).toEqual([]);
  });
});
