import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getKuromojiDicPath } from './kuromojiDictionary.js';

describe('getKuromojiDicPath', () => {
  it("resolves to a real directory that actually contains kuromoji's dictionary files", () => {
    const dicPath = getKuromojiDicPath();

    expect(fs.existsSync(dicPath)).toBe(true);
    expect(fs.statSync(dicPath).isDirectory()).toBe(true);
    // base.dat.gz is the core trie kuromoji.builder().build() loads first —
    // its presence on disk is direct proof the path resolution is correct,
    // not just a plausible-looking string.
    expect(fs.existsSync(path.join(dicPath, 'base.dat.gz'))).toBe(true);
  });
});
