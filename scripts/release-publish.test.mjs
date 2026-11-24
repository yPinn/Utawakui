import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { publishRelease, requiredAssets } from './release-publish.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');

function fakeGh(release) {
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    return args[1] === 'view' ? JSON.stringify(release) : '';
  };
  return { calls, runGh };
}

const completeDraft = {
  isDraft: true,
  isPrerelease: false,
  assets: requiredAssets('0.6.0', true).map((name) => ({ name })),
};

describe('publishRelease', () => {
  it('checks the draft without publishing unless confirmed', () => {
    const { calls, runGh } = fakeGh(completeDraft);
    const result = publishRelease({ rootDirectory, version: '0.6.0', runGh });

    expect(result.published).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('yPinn/Utawakui-Releases');
  });

  it('publishes a complete draft as the stable latest release', () => {
    const { calls, runGh } = fakeGh(completeDraft);
    const result = publishRelease({
      rootDirectory,
      version: '0.6.0',
      confirm: true,
      runGh,
    });

    expect(result.published).toBe(true);
    expect(calls[1]).toEqual([
      'release',
      'edit',
      'v0.6.0',
      '--repo',
      'yPinn/Utawakui-Releases',
      '--draft=false',
      '--latest',
    ]);
  });

  it('refuses published, prerelease, or incomplete drafts', () => {
    const run = (release) =>
      publishRelease({
        rootDirectory,
        version: '0.6.0',
        confirm: true,
        runGh: fakeGh(release).runGh,
      });

    expect(() => run({ ...completeDraft, isDraft: false })).toThrow(
      /already published/,
    );
    expect(() => run({ ...completeDraft, isPrerelease: true })).toThrow(
      /prerelease/,
    );
    expect(() =>
      run({
        ...completeDraft,
        assets: completeDraft.assets.filter(
          ({ name }) => name !== 'update-manifest.json',
        ),
      }),
    ).toThrow(/update-manifest\.json/);
    expect(() =>
      publishRelease({ rootDirectory, version: 'v0.6.0', runGh: () => '' }),
    ).toThrow(/stable version/);
  });
});
