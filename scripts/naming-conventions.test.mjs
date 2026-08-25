import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function filesUnder(relativeDirectory) {
  const directory = resolve(root, relativeDirectory);
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function relativePaths(relativeDirectory, predicate) {
  return filesUnder(relativeDirectory)
    .filter(predicate)
    .map((filePath) => relative(root, filePath).replaceAll('\\', '/'));
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('codebase naming conventions', () => {
  it('uses Vue ecosystem names for components, views, and composables', () => {
    const componentFiles = relativePaths(
      'src/components',
      (filePath) => extname(filePath) === '.vue',
    );
    const viewFiles = relativePaths(
      'src/views',
      (filePath) => extname(filePath) === '.vue',
    );
    const composableFiles = relativePaths(
      'src/composables',
      (filePath) =>
        extname(filePath) === '.js' && !basename(filePath).includes('.test.'),
    );

    expect(
      componentFiles.filter(
        (relativePath) =>
          !/^[A-Z][A-Za-z0-9]*\.vue$/u.test(basename(relativePath)),
      ),
    ).toEqual([]);
    expect(
      viewFiles.filter(
        (relativePath) =>
          !/^[A-Z][A-Za-z0-9]*View\.vue$/u.test(basename(relativePath)),
      ),
    ).toEqual([]);
    expect(
      composableFiles.filter(
        (relativePath) =>
          !/^use[A-Z][A-Za-z0-9]*\.js$/u.test(basename(relativePath)),
      ),
    ).toEqual([]);
  });

  it('keeps Electron handler filenames aligned with their registration export', () => {
    const handlerFiles = relativePaths(
      'electron/main',
      (filePath) =>
        /Handlers\.js$/u.test(basename(filePath)) &&
        !basename(filePath).includes('.test.'),
    );

    const mismatches = handlerFiles.filter((relativePath) => {
      const stem = basename(relativePath, '.js');
      const segments = relativePath.split('/');
      const domain = segments.length > 3 ? segments.at(-2) : '';
      const expectedExport = `register${
        domain ? `${domain[0].toUpperCase()}${domain.slice(1)}` : ''
      }${stem[0].toUpperCase()}${stem.slice(1)}`;
      return !read(relativePath).includes(expectedExport);
    });

    expect(mismatches).toEqual([]);
  });

  it('uses domain-qualified names for lyrics-reading runtime modules', () => {
    expect(existsSync(resolve(root, 'electron/lib/lyricsReading.js'))).toBe(
      true,
    );
    expect(
      existsSync(resolve(root, 'electron/lib/lyricsReadingWorker.js')),
    ).toBe(true);
    expect(existsSync(resolve(root, 'electron/lib/reading.js'))).toBe(false);
    expect(existsSync(resolve(root, 'electron/lib/readingWorker.js'))).toBe(
      false,
    );
    expect(read('electron/lib/library/lyricsReadings.js')).toContain(
      "require('../lyricsReading')",
    );
  });

  it('uses a role-based name for the renderer Workbench guide asset', () => {
    expect(
      existsSync(resolve(root, 'src/assets/workbench-streamer-guide.png')),
    ).toBe(true);
    expect(
      existsSync(resolve(root, 'src/assets/output-preview/Reze.png')),
    ).toBe(false);
  });

  it('documents framework-first naming and intentional domain vocabulary', () => {
    const contract = read('docs/contracts/codebase-naming.md');

    expect(contract).toContain('Framework-first');
    expect(contract).toContain('Music Analysis');
    expect(contract).toContain('Music Structure');
    expect(contract).toContain('contextual module');
  });
});
