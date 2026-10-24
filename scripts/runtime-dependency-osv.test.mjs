import { describe, expect, it } from 'vitest';

import {
  buildOsvQuery,
  collectPypiPackages,
  collectUncheckedArtifacts,
  findingsFromOsvResponse,
  formatReport,
  parseWheelFilename,
} from './runtime-dependency-osv.mjs';

describe('runtime dependency OSV check', () => {
  it('parses wheel filenames and URLs into normalized PyPI identities', () => {
    expect(parseWheelFilename('yt_dlp-2026.8.19-py3-none-any.whl')).toEqual({
      name: 'yt-dlp',
      version: '2026.8.19',
    });
    expect(
      parseWheelFilename(
        'https://files.example/Charset_Normalizer-3.5.2-cp314-cp314-win_amd64.whl',
      ),
    ).toEqual({ name: 'charset-normalizer', version: '3.5.2' });
    expect(parseWheelFilename('python-3.14.7-embed-amd64.zip')).toBeNull();
  });

  it('collects distinct pinned wheels from nested manifests', () => {
    const packages = collectPypiPackages([
      {
        artifacts: [{ url: 'https://x/torch-2.11.0-cp314-none-win_amd64.whl' }],
      },
      { lock: [{ filename: 'torch-2.11.0-cp314-none-win_amd64.whl' }] },
      { filename: 'numpy-2.5.2-cp314-cp314-win_amd64.whl' },
    ]);
    expect(packages).toEqual([
      { name: 'numpy', version: '2.5.2' },
      { name: 'torch', version: '2.11.0' },
    ]);
    expect(buildOsvQuery(packages).queries[0]).toEqual({
      package: { name: 'numpy', ecosystem: 'PyPI' },
      version: '2.5.2',
    });
  });

  it('lists non-wheel, non-model artifacts for manual review', () => {
    expect(
      collectUncheckedArtifacts({
        dependencies: [
          {
            kind: 'runtime',
            artifacts: [
              { name: 'Python', version: '3.14.7', url: 'https://x/py.zip' },
              {
                name: 'yt-dlp',
                version: '1',
                url: 'https://x/yt_dlp-1-py3-none-any.whl',
              },
            ],
          },
          { kind: 'binary', name: 'FFmpeg', version: 'release' },
          { kind: 'model', name: 'Model', version: 'v1' },
        ],
      }),
    ).toEqual(['Python 3.14.7', 'FFmpeg release']);
  });

  it('maps batch results back to packages and reports only findings', () => {
    const packages = [
      { name: 'certifi', version: '1' },
      { name: 'idna', version: '2' },
    ];
    const findings = findingsFromOsvResponse(packages, {
      results: [{ vulns: [{ id: 'GHSA-b' }, { id: 'GHSA-a' }] }, {}],
    });
    expect(findings).toEqual([
      { name: 'certifi', version: '1', ids: ['GHSA-a', 'GHSA-b'] },
    ]);
    const report = formatReport({ packages, findings, unchecked: ['FFmpeg'] });
    expect(report).toContain('Checked 2 pinned PyPI packages');
    expect(report).toContain('[GHSA-a](https://osv.dev/vulnerability/GHSA-a)');
    expect(report).toContain('- FFmpeg');
  });
});
