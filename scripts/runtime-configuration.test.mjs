import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('runtime configuration boundaries', () => {
  it('keeps local Python runtimes and caches out of version control', () => {
    for (const candidate of [
      '.venv/Scripts/python.exe',
      'scratch/venv/Lib/site-packages/runtime.pyd',
      'scratch/uv-cache/archive-v0/package.whl',
      'scratch/.pytest_cache/v/cache/nodeids',
      'scratch/module.pyc',
    ]) {
      const result = spawnSync(
        'git',
        ['check-ignore', '--no-index', '--quiet', candidate],
        { cwd: root },
      );
      expect(result.status, candidate).toBe(0);
    }
  });

  it('packages only fixed app-owned Audio Python workers and catalogs', () => {
    const builder = yaml.load(read('electron-builder.yml'), {
      schema: yaml.JSON_SCHEMA,
    });
    const resources = builder.extraResources.map((entry) => entry.from);

    expect(resources).toEqual([
      'resources/audio-processing/audio_python_worker.py',
      'resources/audio-processing/refined_worker.py',
      'resources/audio-processing/structure_analysis_worker.py',
      'resources/audio-processing/analysis-structure-model.json',
      'resources/audio-processing/analysis-beat-this-small0-model.json',
      'resources/audio-processing/analysis-beat-this-final0-model.json',
      'resources/audio-processing/analysis-beat-this-py314-lock.json',
      'resources/audio-processing/audio-python-runtime-3.14.7.json',
    ]);
    expect(JSON.stringify(builder.files)).not.toMatch(
      /tasks|\.models|\.tmp|\.venv|uv-cache/i,
    );
  });

  it('requires a normalized marked library path before recursive uninstall cleanup', () => {
    const installer = read('build/installer.nsh');
    const sidecar = read('electron/main/libraryPathSidecar.js');

    expect(sidecar).toContain("'.utawakui-library'");
    expect(sidecar).toContain('path.dirname(resolvedLibraryDir) === root');
    expect(sidecar).toContain('removeSidecar(sidecarPath)');
    expect(installer).toContain('GetFullPathName $LibraryDir "$LibraryDir"');
    expect(installer).toContain('${GetRoot} $0 "$LibraryDir"');
    expect(installer).toContain('${GetParent} $2 "$LibraryDir"');
    expect(installer).toContain('$LibraryDir != $0');
    expect(installer).toContain('$2 != $0');
    expect(installer).toContain('$LibraryDir != "$WINDIR"');
    expect(installer).toContain('$LibraryDir != "$TEMP"');
    expect(installer).toContain(
      '${FileExists} "$LibraryDir\\.utawakui-library"',
    );
    expect(installer).toContain('$LibraryCleanupSafe == "true"');
  });
});
