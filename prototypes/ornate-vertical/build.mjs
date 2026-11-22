import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { stdout } from 'node:process';
import { rolldown } from 'rolldown';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const font = 'HinaMincho-Regular.ttf';
const fontRoot = new URL('shared/assets/fonts/', root);
const overlayStyles = [
  'overlay/shared/base.css',
  'overlay/shared/fallback.css',
  'overlay/shared/tokens.css',
  'overlay/lyrics/lyrics.css',
  'overlay/shared/appearance.css',
];

const [html, layers, fontFile, fontLicense] = await Promise.all([
  source('prototypes/ornate-vertical/index.html'),
  Promise.all(overlayStyles.map(source)),
  readFile(new URL(font, fontRoot)),
  source('shared/assets/fonts/OFL-HINA-MINCHO.txt'),
]);
const stageCss = layers
  .join('\n')
  .replace(/@font-face\s*\{[^}]+\}/gu, (rule) =>
    rule.includes(font)
      ? rule.replace(
          `/shared/assets/fonts/${font}`,
          `data:font/ttf;base64,${fontFile.toString('base64')}`,
        )
      : '',
  )
  .replace(/url\('\/overlay\/assets\/streamer-guide\.png'\)/gu, 'none');

const bundle = await rolldown({
  input: fileURLToPath(new URL('preview.mjs', import.meta.url)),
});
const { output } = await bundle.generate({ format: 'iife' });
const [script] = output;
await bundle.close();

const outputDir = new URL('.build/', import.meta.url);
const outputFile = new URL('ornate-vertical-preview.html', outputDir);
await mkdir(outputDir, { recursive: true });
await writeFile(
  outputFile,
  html
    .replace('<!-- embedded-stage-css -->', () => stageCss)
    .replace('<!-- embedded-font-license -->', () => fontLicense)
    .replace('/* embedded-script */', () => script.code),
);
stdout.write(`${fileURLToPath(outputFile)}\n`);
