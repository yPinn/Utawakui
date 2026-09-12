import { describe, expect, it } from 'vitest';
import lrcModule from './lrc.js';

const { parseLrcLines } = lrcModule;

describe('LRCLIB lightweight LRC parser', () => {
  it('keeps authored bracket cues while removing timestamp tags', () => {
    expect(
      parseLrcLines(`[ar:Artist]
[00:01.00][女]第一句
[00:03.00][Chorus]第二句`),
    ).toEqual([
      { start: 1, text: '[女]第一句' },
      { start: 3, text: '[Chorus]第二句' },
    ]);
  });
});
