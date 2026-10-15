import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./PerformanceLyricsWorkspace.vue', import.meta.url),
  'utf8',
);

describe('PerformanceLyricsWorkspace live controls', () => {
  it('switches between existing sources and links to authoring for the rest', () => {
    expect(source).toContain('selectedLyrics.value.sources.map');
    expect(source).toContain('@update:model-value="selectSource"');
    expect(source).toContain(':disabled="sourceOptions.length < 2"');
    expect(source).toContain('@click="openLyricsAuthoring"');
    expect(source).not.toContain('searchLyricsCandidates');
    expect(source).not.toContain('deleteLyricsSource');
  });

  it('explains a missing reading and offers to generate it', () => {
    expect(source).toContain('這首歌還沒有讀音資料。');
    expect(source).toContain('action-label="重試"');
    expect(source).toContain('@action="generateSelectedReading"');
    // Only a finished lookup for the current source may report a miss.
    expect(source).toMatch(
      /showsMissingReading = computed\([\s\S]*?checkedReadingKey\.value === readingKey\.value[\s\S]*?!readingLines\.value\.some\(Boolean\)/u,
    );
    expect(source).toMatch(
      /if \(readingKey\.value === key\) checkedReadingKey\.value = key;/u,
    );
  });
});
