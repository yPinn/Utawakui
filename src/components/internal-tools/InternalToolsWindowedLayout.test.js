import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The app opens windowed (1280×850, min 960×650), so F5–F7 pages respond to
// their own folder/pane width instead of the viewport.
const dirs = ['../analysis/', '../lyrics-provider/'];
const files = [
  ...dirs.flatMap((dir) =>
    readdirSync(new URL(dir, import.meta.url))
      .filter((name) => name.endsWith('.vue'))
      .map((name) => new URL(`${dir}${name}`, import.meta.url)),
  ),
  new URL('../settings/DiagnosticsWorkbench.vue', import.meta.url),
];

describe('internal tools windowed layout', () => {
  it.each(
    files.map((url) => [url.pathname.split('/').slice(-2).join('/'), url]),
  )('%s uses container queries for width breakpoints', (_name, url) => {
    expect(readFileSync(url, 'utf8')).not.toMatch(
      /@media[^{]*\((?:max|min)-width/u,
    );
  });
});
