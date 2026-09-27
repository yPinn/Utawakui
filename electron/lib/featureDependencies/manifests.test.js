import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FEATURE_IDS } from '../featureGates.js';
import { FFMPEG_DEPENDENCY_ID, YTDLP_DEPENDENCY_ID } from './registry.js';
import {
  createMissingDependencyError,
  isDependencyUpdateAvailable,
  readInstalledAt,
  readInstalledVersion,
  writeDependencyManifest,
  writeDependencyNotices,
} from './manifests.js';

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-manifest-test-'));
  tmpDirs.push(dir);
  return dir;
}

function baseDependency(overrides = {}) {
  return {
    id: FFMPEG_DEPENDENCY_ID,
    featureId: FEATURE_IDS.AUDIO_PROCESSING_FLOW,
    kind: 'binary',
    name: 'FFmpeg',
    version: '7.1',
    license: 'GPL-3.0',
    licenseUrl: 'https://example.test/license',
    sourceUrl: 'https://example.test/source',
    downloadUrl: 'https://example.test/download',
    sha256: 'abc123',
    executableRelativePath: 'bin/ffmpeg.exe',
    ...overrides,
  };
}

describe('dependency manifests and notices', () => {
  it.each([
    [{ id: YTDLP_DEPENDENCY_ID, kind: 'runtime' }, 'provider-flow feature'],
    [{ id: 'model', kind: 'model' }, 'audio-processing-flow feature'],
    [{ id: FFMPEG_DEPENDENCY_ID, kind: 'binary' }, 'FFmpeg binary'],
  ])('writes source and license notices for %j', (identity, roleText) => {
    const installDir = makeTempDir();
    const dependency = baseDependency(identity);

    writeDependencyNotices(installDir, dependency);

    const source = fs.readFileSync(path.join(installDir, 'SOURCE.txt'), 'utf8');
    const license = fs.readFileSync(
      path.join(installDir, 'LICENSE.txt'),
      'utf8',
    );
    expect(source).toContain('FFmpeg 7.1');
    expect(source).toContain('Download: https://example.test/download');
    expect(source).toContain(roleText);
    expect(license).toContain('distributed under GPL-3.0');
  });

  it('writes bundled and multi-artifact provenance with deterministic time', () => {
    const dir = makeTempDir();
    const manifestPath = path.join(dir, 'manifest.json');
    const dependency = baseDependency({
      downloadUrl: undefined,
      bundledRelativePath: 'resources/tool.exe',
      fileRelativePath: 'model.onnx',
      modelId: 'model-v1',
      artifacts: [
        {
          role: 'runtime',
          name: 'Runtime',
          version: '3.14',
          sourceUrl: 'https://example.test/runtime-source',
          downloadUrl: 'https://example.test/runtime',
          sha256: 'runtime-sha',
        },
      ],
    });

    writeDependencyManifest(manifestPath, dependency, {
      now: () => new Date('2026-08-25T00:00:00.000Z'),
    });

    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toEqual({
      id: FFMPEG_DEPENDENCY_ID,
      featureId: FEATURE_IDS.AUDIO_PROCESSING_FLOW,
      name: 'FFmpeg',
      version: '7.1',
      license: 'GPL-3.0',
      sourceUrl: 'https://example.test/source',
      artifacts: [
        {
          role: 'runtime',
          name: 'Runtime',
          version: '3.14',
          sourceUrl: 'https://example.test/runtime-source',
          downloadUrl: 'https://example.test/runtime',
          sha256: 'runtime-sha',
        },
      ],
      bundledRelativePath: 'resources/tool.exe',
      sha256: 'abc123',
      installedAt: '2026-08-25T00:00:00.000Z',
      executableRelativePath: 'bin/ffmpeg.exe',
      fileRelativePath: 'model.onnx',
      modelId: 'model-v1',
    });

    writeDependencyNotices(dir, dependency);
    expect(fs.readFileSync(path.join(dir, 'SOURCE.txt'), 'utf8')).toContain(
      'Bundled source: resources/tool.exe',
    );
  });

  it('reads valid install metadata and rejects malformed or missing manifests', () => {
    const dir = makeTempDir();
    const manifestPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ version: '1.2.3', installedAt: '2026-08-25' }),
    );
    expect(readInstalledVersion(manifestPath)).toBe('1.2.3');
    expect(readInstalledAt(manifestPath)).toBe('2026-08-25');

    fs.writeFileSync(manifestPath, JSON.stringify({ version: 7 }));
    expect(readInstalledVersion(manifestPath)).toBeNull();
    expect(readInstalledAt(manifestPath)).toBeNull();

    fs.writeFileSync(manifestPath, '{invalid');
    expect(readInstalledVersion(manifestPath)).toBeNull();
    expect(readInstalledAt(path.join(dir, 'missing.json'))).toBeNull();
  });

  it('reports updates only for pinned differing versions', () => {
    expect(isDependencyUpdateAvailable(baseDependency(), null)).toBe(false);
    expect(
      isDependencyUpdateAvailable(baseDependency({ version: null }), '1.0'),
    ).toBe(false);
    expect(
      isDependencyUpdateAvailable(
        baseDependency({ version: 'release' }),
        'previous',
      ),
    ).toBe(false);
    expect(isDependencyUpdateAvailable(baseDependency(), '7.1')).toBe(false);
    expect(isDependencyUpdateAvailable(baseDependency(), '6.0')).toBe(true);
  });

  it.each([
    [FEATURE_IDS.PROVIDER_FLOW, '尚未準備外部來源工具'],
    [FEATURE_IDS.AUDIO_PROCESSING_FLOW, '尚未準備音訊處理項目'],
  ])('creates bounded public errors for %s', (featureId, title) => {
    const error = createMissingDependencyError(
      baseDependency({ featureId, name: 'Managed tool' }),
    );

    expect(error).toMatchObject({
      code: 'FEATURE_DEPENDENCY_MISSING',
      severity: 'warning',
      title,
      actionLabel: '前往設定',
      context: {
        featureId,
        dependencyId: FFMPEG_DEPENDENCY_ID,
      },
    });
    expect(error.publicMessage).toBe('請到設定準備「Managed tool」。');
    expect(error.message).not.toContain('https://example.test');
  });
});
