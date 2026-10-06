import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

// Vue compiles `:global(x) .y` in a scoped style to just `x`: everything after
// :global(...) is silently dropped, so the rule lands on `x` itself (e.g. the
// document root) instead of `.y`. Write the whole selector inside :global().
const srcRoot = fileURLToPath(new URL('.', import.meta.url));

function vueFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return vueFiles(full);
    return entry.name.endsWith('.vue') ? [full] : [];
  });
}

function maskComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//gu, (comment) =>
    comment.replace(/[^\n]/gu, ' '),
  );
}

function closingParen(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '(') depth += 1;
    else if (css[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function truncatedGlobals(file) {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
  return descriptor.styles
    .filter((style) => style.scoped)
    .flatMap((style) => {
      const css = maskComments(style.content);
      const found = [];
      let index = 0;
      while ((index = css.indexOf(':global(', index)) !== -1) {
        const close = closingParen(css, index + ':global'.length);
        const after = css.slice(close + 1).trimStart();
        if (!/^[,{]/u.test(after)) {
          const line =
            css.slice(0, index).split('\n').length + style.loc.start.line - 1;
          found.push(
            `${relative(srcRoot, file).replaceAll('\\', '/')}:${line}`,
          );
        }
        index = close + 1;
      }
      return found;
    });
}

describe('scoped :global() selectors', () => {
  it('never continue the selector after :global(...)', () => {
    const offenders = vueFiles(srcRoot).flatMap(truncatedGlobals);
    expect(
      offenders,
      'Move the whole selector inside :global(...), e.g. ' +
        ":global(:root[data-ui-motion='reduced'] .x)",
    ).toEqual([]);
  });

  it('detects the truncating form it guards against', () => {
    const css = maskComments(
      '/* :global(x) .y in a comment */ :global(:root[data-a]) .x { opacity: 0; }',
    );
    const index = css.indexOf(':global(');
    const close = closingParen(css, index + ':global'.length);
    expect(css.slice(close + 1).trimStart()).toMatch(/^\.x/u);
  });
});
