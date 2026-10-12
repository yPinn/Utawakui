import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function vueFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name === 'demo') return [];

    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return vueFiles(target);
    return entry.isFile() && entry.name.endsWith('.vue') ? [target] : [];
  });
}

function productionVueSources() {
  return vueFiles(SRC_ROOT).map((file) => ({
    file: path.relative(SRC_ROOT, file).replaceAll(path.sep, '/'),
    source: readFileSync(file, 'utf8'),
  }));
}

function hasStaticClass(source, className) {
  return [...source.matchAll(/\bclass\s*=\s*(["'])(.*?)\1/gsu)].some((match) =>
    match[2].split(/\s+/u).includes(className),
  );
}

describe('production UI primitive adoption', () => {
  it('reuses the global accessible hiding utility', () => {
    const offenders = productionVueSources()
      .filter(
        ({ source }) =>
          hasStaticClass(source, 'visually-hidden') ||
          /^\s*\.visually-hidden\s*\{/mu.test(source),
      )
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('uses UiSearchBox for the lyrics track query', () => {
    const source = readFileSync(
      path.join(SRC_ROOT, 'components/lyrics/LyricsTrackPickerModal.vue'),
      'utf8',
    );

    expect(source).toContain("import UiSearchBox from '../ui/UiSearchBox.vue'");
    expect(source).not.toMatch(/<input\b/gu);
    expect(source).toMatch(
      /<UiSearchBox\s+v-model="query"\s+label="搜尋曲目"\s+placeholder="搜尋曲名、歌手或 ID"\s*\/>/u,
    );
  });
});
