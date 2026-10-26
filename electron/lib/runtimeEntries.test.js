import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNTIME_ENTRIES, resolveRuntimeEntry } from './runtimeEntries.js';

describe('runtime entry paths', () => {
  it('keeps development on source entries even after a release build exists', () => {
    const root = path.resolve('project');
    for (const [key, entry] of Object.entries(RUNTIME_ENTRIES)) {
      expect(resolveRuntimeEntry(root, key)).toBe(
        path.join(root, entry.source),
      );
    }
  });

  it('uses real disk entries for workers and the Node probe only', () => {
    const archive = path.resolve('resources/app.asar');
    for (const [key, entry] of Object.entries(RUNTIME_ENTRIES)) {
      expect(resolveRuntimeEntry(archive, key)).toBe(
        path.join(
          entry.physical ? `${archive}.unpacked` : archive,
          'runtime',
          entry.file,
        ),
      );
    }
  });

  it('does not append another unpacked suffix in a worker process', () => {
    const archive = path.resolve('resources/app.asar');
    expect(resolveRuntimeEntry(`${archive}.unpacked`, 'lyricsProbe')).toBe(
      path.join(`${archive}.unpacked`, 'runtime', 'probe.cjs'),
    );
  });

  it.each(['unknown', '../main', '__proto__', 'constructor', null])(
    'rejects unknown entry keys: %j',
    (key) =>
      expect(() => resolveRuntimeEntry(path.resolve('project'), key)).toThrow(),
  );
});
