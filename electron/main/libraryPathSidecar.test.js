import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGACY_LIBRARY_MARKER_FILENAME,
  LIBRARY_OWNERSHIP_MARKER_FILENAME,
  LIBRARY_OWNERSHIP_MARKER_VALUE,
  writeLibraryPathSidecar,
} from './libraryPathSidecar.js';

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
  it('claims and records a new dedicated library root', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const libraryDir = path.join(root, 'music', 'Utawakui');

    expect(writeLibraryPathSidecar(userDataDir, libraryDir)).toBe(true);

    expect(
      fs.readFileSync(path.join(userDataDir, 'library-path.txt'), 'utf16le'),
    ).toBe(libraryDir);
    expect(
      fs.readFileSync(
        path.join(libraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME),
        'utf8',
      ),
    ).toBe(LIBRARY_OWNERSHIP_MARKER_VALUE);
  });

  it('claims an existing empty directory selected as a dedicated root', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const libraryDir = path.join(root, 'music', 'empty-library');
    fs.mkdirSync(libraryDir, { recursive: true });

    expect(writeLibraryPathSidecar(userDataDir, libraryDir)).toBe(true);
    expect(
      fs.readFileSync(
        path.join(libraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME),
        'utf8',
      ),
    ).toBe(LIBRARY_OWNERSHIP_MARKER_VALUE);
  });

  it('does not claim or record an existing non-empty directory', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const libraryDir = path.join(root, 'music', 'shared-covers');
    fs.mkdirSync(libraryDir, { recursive: true });
    fs.writeFileSync(path.join(libraryDir, 'keep-me.mp3'), 'user media');

    expect(writeLibraryPathSidecar(userDataDir, libraryDir)).toBe(false);

    expect(fs.existsSync(path.join(userDataDir, 'library-path.txt'))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(libraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME)),
    ).toBe(false);
    expect(fs.readFileSync(path.join(libraryDir, 'keep-me.mp3'), 'utf8')).toBe(
      'user media',
    );
  });

  it('records a populated directory that already has a valid ownership marker', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const libraryDir = path.join(root, 'music', 'Utawakui');
    fs.mkdirSync(libraryDir, { recursive: true });
    fs.writeFileSync(
      path.join(libraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME),
      LIBRARY_OWNERSHIP_MARKER_VALUE,
    );
    fs.writeFileSync(path.join(libraryDir, 'library.json'), '{}');

    expect(writeLibraryPathSidecar(userDataDir, libraryDir)).toBe(true);
    expect(
      fs.readFileSync(path.join(userDataDir, 'library-path.txt'), 'utf16le'),
    ).toBe(libraryDir);
  });

  it('rejects a tampered ownership marker and removes a stale sidecar', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const ownedLibraryDir = path.join(root, 'music', 'owned');
    const tamperedLibraryDir = path.join(root, 'music', 'tampered');

    expect(writeLibraryPathSidecar(userDataDir, ownedLibraryDir)).toBe(true);
    fs.mkdirSync(tamperedLibraryDir, { recursive: true });
    fs.writeFileSync(
      path.join(tamperedLibraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME),
      'not-the-owner-token',
    );
    fs.writeFileSync(path.join(tamperedLibraryDir, 'keep-me.txt'), 'user data');

    expect(writeLibraryPathSidecar(userDataDir, tamperedLibraryDir)).toBe(
      false,
    );
    expect(fs.existsSync(path.join(userDataDir, 'library-path.txt'))).toBe(
      false,
    );
    expect(
      fs.readFileSync(path.join(tamperedLibraryDir, 'keep-me.txt'), 'utf8'),
    ).toBe('user data');
  });

  it('upgrades a legacy marker only when it is the directory sole entry', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const emptyLibraryDir = path.join(root, 'music', 'empty-library');
    const populatedLibraryDir = path.join(root, 'music', 'populated-library');
    for (const libraryDir of [emptyLibraryDir, populatedLibraryDir]) {
      fs.mkdirSync(libraryDir, { recursive: true });
      fs.writeFileSync(
        path.join(libraryDir, LEGACY_LIBRARY_MARKER_FILENAME),
        'Utawakui library root\n',
      );
    }
    fs.writeFileSync(
      path.join(populatedLibraryDir, 'keep-me.txt'),
      'user data',
    );

    expect(writeLibraryPathSidecar(userDataDir, emptyLibraryDir)).toBe(true);
    expect(
      fs.existsSync(
        path.join(emptyLibraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(emptyLibraryDir, LEGACY_LIBRARY_MARKER_FILENAME)),
    ).toBe(false);

    expect(writeLibraryPathSidecar(userDataDir, populatedLibraryDir)).toBe(
      false,
    );
    expect(
      fs.existsSync(
        path.join(populatedLibraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME),
      ),
    ).toBe(false);
    expect(
      fs.readFileSync(path.join(populatedLibraryDir, 'keep-me.txt'), 'utf8'),
    ).toBe('user data');
  });

  it('does not upgrade a legacy marker with unexpected content', () => {
    const root = makeTempDir();
    const userDataDir = path.join(root, 'user-data');
    const libraryDir = path.join(root, 'music', 'legacy-library');
    fs.mkdirSync(libraryDir, { recursive: true });
    fs.writeFileSync(
      path.join(libraryDir, LEGACY_LIBRARY_MARKER_FILENAME),
      'modified legacy marker',
    );

    expect(writeLibraryPathSidecar(userDataDir, libraryDir)).toBe(false);
    expect(
      fs.existsSync(path.join(libraryDir, LIBRARY_OWNERSHIP_MARKER_FILENAME)),
    ).toBe(false);
    expect(
      fs.readFileSync(
        path.join(libraryDir, LEGACY_LIBRARY_MARKER_FILENAME),
        'utf8',
      ),
    ).toBe('modified legacy marker');
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
