import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  atomicWriteJson,
  atomicWriteText,
  atomicWriteBuffer,
  atomicCopyFileSync,
  backupCorrupted,
} from './atomicWrite.js';

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

describe('atomicWriteText', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-atomic-test-'));
    filePath = path.join(dir, 'data.txt');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the given text as utf8 and leaves no .tmp file', () => {
    atomicWriteText(filePath, '哈囉世界');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('哈囉世界');
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });
});

describe('atomicWriteBuffer', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-atomic-test-'));
    filePath = path.join(dir, 'data.bin');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the given buffer bytes exactly and leaves no .tmp file', () => {
    const buffer = Buffer.from([0, 1, 2, 255]);
    atomicWriteBuffer(filePath, buffer);
    expect(fs.readFileSync(filePath)).toEqual(buffer);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });
});

describe('atomicCopyFileSync', () => {
  let dir;
  let sourcePath;
  let targetPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-atomic-test-'));
    sourcePath = path.join(dir, 'source.png');
    targetPath = path.join(dir, 'target.png');
    fs.writeFileSync(sourcePath, Buffer.from([1, 2, 3, 4]));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('copies the source bytes exactly and leaves no .tmp file', () => {
    atomicCopyFileSync(sourcePath, targetPath);
    expect(fs.readFileSync(targetPath)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(fs.existsSync(`${targetPath}.tmp`)).toBe(false);
  });

  it('a second copy cleanly overwrites the first target', () => {
    atomicCopyFileSync(sourcePath, targetPath);
    fs.writeFileSync(sourcePath, Buffer.from([9, 9]));
    atomicCopyFileSync(sourcePath, targetPath);
    expect(fs.readFileSync(targetPath)).toEqual(Buffer.from([9, 9]));
  });
});

describe('backupCorrupted', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-atomic-test-'));
    filePath = path.join(dir, 'data.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renames the corrupted file aside with a timestamp suffix', () => {
    fs.writeFileSync(filePath, '{ broken');

    backupCorrupted(filePath);

    expect(fs.existsSync(filePath)).toBe(false);
    const backups = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('data.json.corrupted-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]), 'utf8')).toBe(
      '{ broken',
    );
  });

  it('ignores missing files', () => {
    expect(() => backupCorrupted(filePath)).not.toThrow();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
