import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const featureSources = [
  resolve(root, 'src/App.vue'),
  ...filesUnder(resolve(root, 'src/components')),
  ...filesUnder(resolve(root, 'src/views')),
]
  .filter(
    (path) =>
      path.endsWith('.vue') &&
      !path.includes(resolve(root, 'src/components/ui')) &&
      !path.includes(resolve(root, 'src/components/demo')),
  )
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

describe('shared primitive adoption', () => {
  it('styles public component roots through consumer classes instead of deep selectors', () => {
    const deepRootOverrides = featureSources.flatMap(({ path, source }) =>
      [...source.matchAll(/:deep\(\.(?:ui-btn|ui-hint|ui-search-box)\)/gu)].map(
        (match) =>
          `${relative(root, path).replaceAll('\\', '/')}:${
            source.slice(0, match.index).split('\n').length
          } -> ${match[0]}`,
      ),
    );

    expect(deepRootOverrides).toEqual([]);
  });

  it('keeps UiTextarea field anatomy owned by the primitive', () => {
    const anatomyOverrides = featureSources.flatMap(({ path, source }) =>
      [
        ...source.matchAll(
          /:deep\(\.(?:ui-field__main|ui-field__control|ui-textarea)\)/gu,
        ),
      ].map(
        (match) =>
          `${relative(root, path).replaceAll('\\', '/')}:${
            source.slice(0, match.index).split('\n').length
          } -> ${match[0]}`,
      ),
    );

    expect(anatomyOverrides).toEqual([]);
  });

  it('keeps consumer spacing and radius declarations on tokens or named local optics', () => {
    const literalSpacing = featureSources.flatMap(({ path, source }) =>
      [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)].flatMap(
        ([, styles]) =>
          [
            ...styles.matchAll(
              /(?:^|\n)\s*((?:padding|margin|gap|border-radius)(?:-[a-z-]+)?):\s*([^;]+);/gu,
            ),
          ].flatMap((match) => {
            const nonzeroLiterals = [
              ...match[2].matchAll(/-?\d+(?:\.\d+)?(?:px|rem|em)\b/gu),
            ]
              .map(([value]) => value)
              .filter((value) => Number.parseFloat(value) !== 0);
            return nonzeroLiterals.map(
              (value) =>
                `${relative(root, path).replaceAll('\\', '/')} -> ${match[1]}: ${value}`,
            );
          }),
      ),
    );

    expect(literalSpacing).toEqual([]);
  });
});
