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
  it('resolves local npm command targets and chained script names', () => {
    const { scripts } = JSON.parse(read('package.json'));
    for (const [name, command] of Object.entries(scripts)) {
      for (const [, target] of command.matchAll(
        /\b(?:node|-File)\s+(scripts\/[\w./-]+)/g,
      )) {
        expect(fs.statSync(path.join(root, target)).isFile(), name).toBe(true);
      }
      // `--prefix <dir>` runs the script from that subproject's package.json.
      for (const [, target, prefix] of command.matchAll(
        /\bnpm run ([\w:-]+)(?:\s+--prefix\s+([\w./-]+))?/g,
      )) {
        const owner = prefix
          ? JSON.parse(read(`${prefix}/package.json`)).scripts
          : scripts;
        expect(owner, name).toHaveProperty(target);
      }
    }
  });

  it('checks staged Markdown filenames with spaces through the pre-commit configuration', () => {
    const hook = read('.husky/pre-commit').trim().split(/\s+/u);
    expect(hook.slice(0, 4)).toEqual(['npx', '--no', '--', 'lint-staged']);

    const tasks = path.join(root, 'tasks');
    fs.mkdirSync(tasks, { recursive: true });
    const cwd = fs.mkdtempSync(path.join(tasks, 'lint-staged-'));
    const markdownFile = 'docs/heading with spaces.md';
    const pathKey =
      Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ??
      'PATH';
    const env = {
      ...process.env,
      [pathKey]: [path.join(root, 'node_modules/.bin'), process.env[pathKey]]
        .filter(Boolean)
        .join(path.delimiter),
    };
    const options = {
      cwd,
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    };
    try {
      for (const file of [
        '.gitignore',
        '.markdownlint-cli2.jsonc',
        'package.json',
      ]) {
        fs.copyFileSync(path.join(root, file), path.join(cwd, file));
      }
      fs.mkdirSync(path.join(cwd, 'docs'));
      fs.writeFileSync(path.join(cwd, markdownFile), '# Title\n');

      for (const args of [
        ['init', '--quiet'],
        ['add', '--', markdownFile],
      ]) {
        const result = spawnSync('git', args, options);
        expect(result.status, result.stderr).toBe(0);
      }
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, 'node_modules/lint-staged/bin/lint-staged.js'),
          ...hook.slice(4),
          '--no-stash',
          '--verbose',
        ],
        options,
      );
      const output = result.stdout + result.stderr;
      expect(result.status, result.error?.message ?? output).toBe(0);
      expect(output).toContain(`Finding: ${markdownFile}`);
      expect(output).toContain('Linting: 1 file');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

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

  it.each([
    ['.env', 0],
    ['.env.development.local', 0],
    ['site/.env.production', 0],
    ['services/feedback-relay/.dev.vars', 0],
    ['services/feedback-relay/.dev.vars.staging', 0],
    ['site/dist/index.html', 0],
    ['site/node_modules/vue/package.json', 0],
    ['site/.env.example', 1],
    ['site/.env.production.example', 1],
    ['services/feedback-relay/.dev.vars.example', 1],
    ['site/src/App.vue', 1],
    ['build/installer.nsh', 1],
  ])('applies the Git ignore policy to %s', (candidate, code) => {
    const result = spawnSync(
      'git',
      ['check-ignore', '--no-index', '--quiet', candidate],
      { cwd: root },
    );
    expect(result.status).toBe(code);
  });

  it('packages fixed notices, the portrait model, app-owned Python workers and Audio catalogs', () => {
    const builder = yaml.load(read('electron-builder.yml'), {
      schema: yaml.JSON_SCHEMA,
    });
    const resources = builder.extraResources.map((entry) => entry.from);

    expect(resources).toEqual([
      'third-party',
      'resources/output-portrait/u2netp.onnx',
      'resources/audio-processing/audio_python_worker.py',
      'resources/audio-processing/lyrics_acoustic_probe.py',
      'resources/audio-processing/lyrics-acoustic-catalog.json',
      'resources/audio-processing/refined_worker.py',
      'resources/audio-processing/structure_analysis_worker.py',
      'resources/audio-processing/analysis-structure-model.json',
      'resources/audio-processing/analysis-beat-this-small0-model.json',
      'resources/audio-processing/analysis-beat-this-final0-model.json',
      'resources/audio-processing/analysis-beat-this-py314-lock.json',
      'resources/audio-processing/audio-python-runtime-3.14.7.json',
      'resources/provider/artist_photo_ytmusic_worker.py',
      'resources/provider/release_catalog_worker.py',
      'native/keyboard-shortcuts/.build',
    ]);
    expect(JSON.stringify(builder.files)).not.toMatch(
      /tasks|\.models|\.tmp|\.venv|uv-cache/i,
    );
  });

  it('locks the supported Electron 43 patch and hardens packaged fuses', () => {
    const packageJson = JSON.parse(read('package.json'));
    const packageLock = JSON.parse(read('package-lock.json'));
    const builder = yaml.load(read('electron-builder.yml'), {
      schema: yaml.JSON_SCHEMA,
    });

    expect(packageJson.devDependencies.electron).toBe('^43.7.8');
    const lockedElectron =
      packageLock.packages['node_modules/electron'].version;
    expect(lockedElectron).toMatch(/^43\.\d+\.\d+$/u);
    expect(builder.electronVersion).toBe(lockedElectron);
    expect(builder.electronFuses).toEqual({
      runAsNode: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: true,
    });
  });

  it('requires a normalized marked library path before recursive uninstall cleanup', () => {
    const installer = read('build/installer.nsh');
    const sidecar = read('electron/main/libraryPathSidecar.js');

    expect(sidecar).toContain("'.utawakui-library-owner-v2'");
    expect(sidecar).toContain("'utawakui-dedicated-library-v2'");
    expect(sidecar).toContain('entries.length === 0');
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
      'FileOpen $3 "$LibraryDir\\.utawakui-library-owner-v2" r',
    );
    expect(installer).toContain('StrCpy $4 ""');
    expect(installer).toContain('FileRead $3 $4');
    expect(installer).toContain('$4 == "utawakui-dedicated-library-v2"');
    expect(installer).toContain('Function un.utaValidateLibraryCleanup');
    expect(installer.match(/Call un\.utaValidateLibraryCleanup/g)).toHaveLength(
      2,
    );
    expect(installer).toContain('$LibraryCleanupSafe == "true"');
  });
});
