import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeLibraryPathSidecar } from './libraryPathSidecar.js';

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function makeTempDir() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-library-sidecar-'),
  );
  tmpDirs.push(dir);
  return dir;
}

describe('library uninstall sidecar', () => {
  it('records only a marked safe library root', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const libraryDir = path.join(root, 'music', 'Utawakui');

    expect(writeLibraryPathSidecar(userDataDir, libraryDir)).toBe(true);

    expect(
      fs.readFileSync(path.join(userDataDir, 'library-path.txt'), 'utf16le'),
    ).toBe(libraryDir);
    expect(fs.existsSync(path.join(libraryDir, '.utawakui-library'))).toBe(
      true,
    );
  });

  it('removes a stale sidecar when the configured path is unsafe', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const safeLibraryDir = path.join(root, 'music', 'Utawakui');
    const sidecarPath = path.join(userDataDir, 'library-path.txt');

    expect(writeLibraryPathSidecar(userDataDir, safeLibraryDir)).toBe(true);
    expect(fs.existsSync(sidecarPath)).toBe(true);

    expect(writeLibraryPathSidecar(userDataDir, path.parse(root).root)).toBe(
      false,
    );
    expect(fs.existsSync(sidecarPath)).toBe(false);
  });
});
