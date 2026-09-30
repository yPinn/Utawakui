import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_COMPONENTS = [
  'UiSeparator.vue',
  'UiStack.vue',
  'UiSurface.vue',
  'UiSegmentedControl.vue',
];

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function tokenNames(componentSource) {
  return [...componentSource.matchAll(/var\((--ui-[\w-]+)/gu)].map(
    (match) => match[1],
  );
}

function vueFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'demo' ? [] : vueFiles(target);
    }
    return entry.isFile() && entry.name.endsWith('.vue') ? [target] : [];
  });
}

describe('Token v2 first production adoption batch', () => {
  it('resolves every adopted primitive token in active and v2 scopes', () => {
    const activeTokens = source('../../styles/tokens.css');
    const v2Tokens = source('../../styles/tokens-v2.css');

    for (const component of UI_COMPONENTS) {
      const componentSource = source(`./${component}`);
      for (const token of new Set(tokenNames(componentSource))) {
        expect(activeTokens, `${component} active ${token}`).toContain(
          `${token}:`,
        );
        expect(v2Tokens, `${component} v2 ${token}`).toContain(`${token}:`);
      }
    }
  });

  it('passes numeric UiStack gap steps as Vue bindings in production SFCs', () => {
    const componentsRoot = fileURLToPath(new URL('../', import.meta.url));
    const offenders = vueFiles(componentsRoot)
      .filter((file) =>
        /<UiStack\b[^>]*\sgap="\d+"/su.test(readFileSync(file, 'utf8')),
      )
      .map((file) => path.relative(componentsRoot, file));

    expect(offenders).toEqual([]);
  });
});
