import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const readSibling = (name) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

const PREVIEW_DIRECTORY = 'previews';
const STYLE_SRC = /<style[^>]*\ssrc="\.\/([^"]+)"[^>]*><\/style>/gu;

const styleSources = (vue) => [...vue.matchAll(STYLE_SRC)].map((m) => m[1]);

// One preview component's source plus its stylesheet,
// e.g. readObsTemplatePreviewSource('KaraokeStack').
export function readObsTemplatePreviewSource(name) {
  const vue = readSibling(`${PREVIEW_DIRECTORY}/${name}Preview.vue`);
  const css = styleSources(vue)
    .map((file) => readSibling(`${PREVIEW_DIRECTORY}/${file}`))
    .join('\n');
  return `${vue}\n<style>\n${css}</style>\n`;
}

// Source-contract tests assert on template and CSS text together. Rebuild one
// text from the shell, every preview, and the stylesheets in load order:
// shared base, each preview's rules, then the shell's late overrides.
export function readObsTemplateMockupSource() {
  const shell = readSibling('ObsTemplateMockup.vue');
  const previewNames = readdirSync(
    fileURLToPath(new URL(`./${PREVIEW_DIRECTORY}/`, import.meta.url)),
  )
    .filter((name) => name.endsWith('.vue'))
    .sort();
  const previews = previewNames.map((name) =>
    readSibling(`${PREVIEW_DIRECTORY}/${name}`),
  );
  const css = [
    readSibling('ObsTemplateMockup.base.css'),
    ...previews.flatMap((vue) =>
      styleSources(vue).map((file) =>
        readSibling(`${PREVIEW_DIRECTORY}/${file}`),
      ),
    ),
    ...styleSources(shell).map(readSibling),
  ].join('\n');
  const templateEnd = shell.indexOf('<style');
  return `${shell.slice(0, templateEnd)}\n${previews.join('\n')}\n<style>\n${css}</style>\n`;
}
