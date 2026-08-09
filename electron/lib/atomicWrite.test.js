import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { atomicWriteJson } from './atomicWrite.js';

describe('atomicWriteJson', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-atomic-test-'));
    filePath = path.join(dir, 'data.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the file with the given data', () => {
    atomicWriteJson(filePath, { a: 1 });
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({ a: 1 });
  });

  it('leaves no leftover .tmp file', () => {
    atomicWriteJson(filePath, { a: 1 });
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it('a second write cleanly overwrites the first', () => {
    atomicWriteJson(filePath, { a: 1 });
    atomicWriteJson(filePath, { a: 2, b: 'overwrite' });
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({
      a: 2,
      b: 'overwrite',
    });
  });
});
