import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseNeteaseEvaluationCliArgs,
  sanitizeNeteaseCliResult,
} from './lyrics-provider-netease-cli.mjs';

describe('NetEase evaluation CLI contract', () => {
  it.each([
    'provision',
    'smoke',
    'sentinel-start',
    'sentinel-run',
    'sentinel-status',
    'sentinel-stop',
    'report',
  ])(
    'accepts the fixed %s command without paths or provider arguments',
    (command) => {
      expect(parseNeteaseEvaluationCliArgs([command])).toEqual({ command });
    },
  );

  it.each([
    [],
    ['smoke', 'private.json'],
    ['unknown'],
    ['provision', '--cookie=private'],
  ])('rejects dynamic CLI input %#', (args) => {
    expect(() => parseNeteaseEvaluationCliArgs(args)).toThrow(/usage/i);
  });

  it('projects only bounded public status fields', () => {
    expect(
      sanitizeNeteaseCliResult({
        command: 'provision',
        status: 'ready',
        profileId: 'netease-yrc-evaluation-v1',
        packageVersion: '4.40.1',
        installedBytes: 1000,
        runtimeRoot: 'E:\\private\\runtime',
        providerBody: 'private body',
      }),
    ).toEqual({
      command: 'provision',
      status: 'ready',
      profileId: 'netease-yrc-evaluation-v1',
      packageVersion: '4.40.1',
      installedBytes: 1000,
    });
  });

  it('allows only exact bounded smoke review summaries', () => {
    const reviewCandidate = {
      languageGroup: 'zh',
      reference: {
        title: 'Expected',
        artist: 'Expected Artist',
        album: null,
        durationSeconds: 180,
        version: 'studio',
      },
      candidate: {
        title: 'Candidate',
        artists: ['Candidate Artist'],
        album: null,
        durationSeconds: 184,
        matchBand: 'strong',
        durationDeltaSeconds: 4,
        versionMismatch: false,
      },
    };
    expect(
      sanitizeNeteaseCliResult({
        command: 'smoke',
        status: 'owner-review-required',
        reviewCandidates: [reviewCandidate],
      }),
    ).toMatchObject({ reviewCandidates: [reviewCandidate] });
    expect(() =>
      sanitizeNeteaseCliResult({
        command: 'smoke',
        status: 'owner-review-required',
        reviewCandidates: [
          { ...reviewCandidate, providerBody: 'forbidden body' },
        ],
      }),
    ).toThrow(/CLI result/i);
  });

  it('keeps the reverse package out of product scripts and production dependencies', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(packageJson.scripts['lyrics:netease-evaluation']).toBe(
      'node scripts/lyrics-provider-netease-cli.mjs',
    );
    expect(packageJson.dependencies).not.toHaveProperty(
      '@neteasecloudmusicapienhanced/api',
    );
    expect(packageJson.devDependencies).not.toHaveProperty(
      '@neteasecloudmusicapienhanced/api',
    );
  });
});
