import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSourceTranslations,
  translationLanguage,
} from './lyricsSourceTranslations.js';

const filename = 'betterlyrics-7.lrc';
const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:lrc="http://lrc.red/lyric-ttml-internal" xml:lang="ko">
  <head><metadata><sourceMetadata xmlns="http://lrc.red/lyric-ttml-internal">
    <translations><translation xml:lang="en-US">
      <text for="L1">The wind at sunset</text><text for="L2">Baby, you remind me</text>
    </translation></translations>
  </sourceMetadata></metadata></head>
  <body dur="10s">
    <p begin="1s" end="2s" lrc:key="L1">해 질 때의 바람</p>
    <p begin="2s" end="3s" lrc:key="L2">Baby, you remind me</p>
  </body>
</tt>`;
const document = {
  documentId: 'doc',
  lines: [
    { lineId: 'a', text: '해 질 때의 바람' },
    { lineId: 'b', text: 'Baby, you remind me' },
  ],
};
let trackDir;

function writeSource(provider = 'betterlyrics', record = { id: 7 }) {
  const lyricsDir = path.join(trackDir, 'lyrics');
  fs.mkdirSync(path.join(lyricsDir, 'providers'), { recursive: true });
  fs.writeFileSync(path.join(lyricsDir, filename), '[00:01.00]x\n');
  fs.writeFileSync(
    path.join(lyricsDir, 'lyrics.json'),
    JSON.stringify({
      version: 1,
      sources: [
        {
          filename,
          language: 'und',
          kind: provider,
          provider: {
            name: provider,
            recordId: 7,
            artifactFilename: 'betterlyrics-7.json',
          },
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(lyricsDir, 'providers', 'betterlyrics-7.json'),
    JSON.stringify({ record: { duration: 10, ttml, ...record } }),
  );
}

beforeEach(() => {
  trackDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'source-translations-')),
  );
});
afterEach(() => fs.rmSync(trackDir, { recursive: true, force: true }));

describe('provider source translations', () => {
  it('maps provider language tags to supported translation languages', () => {
    expect(translationLanguage('en-US')).toBe('en');
    expect(translationLanguage('zh-Hant-TW')).toBe('zh-TW');
    expect(translationLanguage('zh-HK')).toBe('zh-TW');
    expect(translationLanguage('zh-Hans')).toBeNull();
    expect(translationLanguage('ja-Latn')).toBeNull();
  });

  it('binds matching lines and skips lines already in the target language', () => {
    writeSource();
    expect(loadSourceTranslations(trackDir, filename, document)).toEqual({
      en: [
        {
          lineId: 'a',
          original: '해 질 때의 바람',
          text: 'The wind at sunset',
        },
      ],
    });
  });

  it('offers nothing when the saved lyrics no longer match or the source is not a provider', () => {
    writeSource();
    expect(
      loadSourceTranslations(trackDir, filename, {
        ...document,
        lines: [{ ...document.lines[0], text: '바뀐 가사' }, document.lines[1]],
      }),
    ).toEqual({});
    writeSource('lrclib');
    expect(loadSourceTranslations(trackDir, filename, document)).toEqual({});
  });
});
