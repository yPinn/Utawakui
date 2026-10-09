import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { baseParse, ElementTypes, NodeTypes } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOTS = ['src/components', 'src/views'];
const ALLOWED_NATIVE_TITLES = [
  'src/components/output/ObsOverlayPreview.vue:iframe',
  'src/components/output/ObsWidgetCapturePreview.vue:iframe',
];

function productionVueFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (absolutePath.includes(path.join('components', 'demo'))) return [];
      return productionVueFiles(absolutePath);
    }
    if (!entry.name.endsWith('.vue')) return [];
    if (entry.name === 'UiComponentLab.vue') return [];
    return [absolutePath];
  });
}

function nativeTitleAttributes(filename) {
  const source = readFileSync(filename, 'utf8');
  const template = parse(source, { filename }).descriptor.template;
  if (!template) return [];

  const titles = [];
  const visit = (node) => {
    if (
      node.type === NodeTypes.ELEMENT &&
      node.tagType === ElementTypes.ELEMENT
    ) {
      for (const prop of node.props) {
        const isStaticTitle =
          prop.type === NodeTypes.ATTRIBUTE && prop.name === 'title';
        const isBoundTitle =
          prop.type === NodeTypes.DIRECTIVE &&
          prop.name === 'bind' &&
          prop.arg?.isStatic &&
          prop.arg.content === 'title';
        if (!isStaticTitle && !isBoundTitle) continue;
        titles.push({
          file: filename.split(path.sep).join('/'),
          line: template.loc.start.line + prop.loc.start.line - 1,
          tag: node.tag,
        });
      }
    }
    for (const child of node.children ?? []) visit(child);
  };

  visit(baseParse(template.content));
  return titles;
}

describe('native tooltip production boundary', () => {
  it('reserves native title for the explicit iframe accessible-name allowlist', () => {
    const titles = SOURCE_ROOTS.flatMap(productionVueFiles).flatMap(
      nativeTitleAttributes,
    );
    const allowed = titles
      .filter(({ tag }) => tag === 'iframe')
      .map(({ file, tag }) => `${file}:${tag}`)
      .sort();
    const violations = titles
      .filter(({ tag }) => tag !== 'iframe')
      .map(({ file, line, tag }) => `${file}:${line} <${tag}>`)
      .sort();

    expect(allowed).toEqual(ALLOWED_NATIVE_TITLES);
    expect(violations).toEqual([]);
  });
});
