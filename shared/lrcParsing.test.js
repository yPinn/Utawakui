import { describe, expect, it } from 'vitest';
import {
  isLrcMetadataLine,
  lrcTimestamps,
  parseLrcTimestamp,
  stripLrcTimestampTags,
} from './lrcParsing.mjs';

describe('shared LRC parsing primitives', () => {
  it('distinguishes timestamps, metadata, and authored bracket text', () => {
    expect(parseLrcTimestamp('01:02.50')).toBe(62.5);
    expect(isLrcMetadataLine('[la:ja]')).toBe(true);
    expect(isLrcMetadataLine('[tool:Lyrics Editor]')).toBe(true);
    expect(isLrcMetadataLine('[Verse]')).toBe(false);
    expect(isLrcMetadataLine('[女]')).toBe(false);
  });

  it('removes only timestamp tags and preserves speaker or section cues', () => {
    const source = '[00:04.50][女]她的歌詞';

    expect(lrcTimestamps(source)).toEqual([4.5]);
    expect(stripLrcTimestampTags(source)).toBe('[女]她的歌詞');
  });
});
