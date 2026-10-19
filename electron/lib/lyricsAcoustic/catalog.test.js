import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  loadLyricsAcousticCatalog,
  lyricsAcousticResourcePaths,
} from './catalog.js';
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);
it('keeps the production catalog gated in dev and resolves the same packaged resources', () => {
  const dev = loadLyricsAcousticCatalog({
    isPackaged: false,
    appPath: process.cwd(),
  });
  expect(dev.catalog.productUse).toBe('blocked');
  expect(dev.catalog.blockReason).toBe('weights-evidence-pending');
  expect(fs.existsSync(dev.pythonProbePath)).toBe(true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-catalog-'));
  roots.push(dir);
  fs.cpSync(
    path.join(process.cwd(), 'resources/audio-processing'),
    path.join(dir, 'audio-processing'),
    { recursive: true },
  );
  expect(
    loadLyricsAcousticCatalog({ isPackaged: true, resourcesPath: dir }).catalog,
  ).toEqual(dev.catalog);
  const paths = lyricsAcousticResourcePaths({
    isPackaged: true,
    resourcesPath: dir,
  });
  fs.writeFileSync(
    paths.catalogPath,
    JSON.stringify({ ...dev.catalog, capabilityId: 'other' }),
  );
  expect(() =>
    loadLyricsAcousticCatalog({ isPackaged: true, resourcesPath: dir }),
  ).toThrow('mismatch');
  fs.writeFileSync(paths.catalogPath, ' '.repeat(262145));
  expect(() =>
    loadLyricsAcousticCatalog({ isPackaged: true, resourcesPath: dir }),
  ).toThrow('budget');
  expect(() =>
    lyricsAcousticResourcePaths({
      isPackaged: true,
      resourcesPath: 'relative',
    }),
  ).toThrow('root');
});
