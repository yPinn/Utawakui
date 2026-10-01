import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const readSibling = (name) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

// Source-contract tests assert on template and CSS text together, in order.
// ObsTemplateMockup.vue keeps its CSS in sibling files, so rebuild the single
// `<style>` text those tests were written against.
export function readObsTemplateMockupSource() {
  const vue = readSibling('ObsTemplateMockup.vue');
  const styleFiles = [
    ...vue.matchAll(/<style[^>]*\ssrc="\.\/([^"]+)"[^>]*><\/style>/gu),
  ].map((match) => match[1]);
  const templateEnd = vue.indexOf('<style');
  const css = styleFiles.map(readSibling).join('\n');
  return `${vue.slice(0, templateEnd)}<style scoped>\n${css}</style>\n`;
}
