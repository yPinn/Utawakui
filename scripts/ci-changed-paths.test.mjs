import { describe, expect, it } from 'vitest';

import {
  classifyChangedPaths,
  createCiPlan,
  formatGitHubOutputs,
  readChangedPaths,
} from './ci-changed-paths.mjs';

describe('CI changed-path policy', () => {
  it.each([
    {
      name: 'documentation-only changes stay in preflight',
      paths: ['README.md', 'docs/operations/release-runbook.md'],
      expected: {
        dependencyAudit: false,
        quality: false,
        windowsPackage: false,
      },
    },
    {
      name: 'renderer changes need quality checks but not packaging',
      paths: ['src/App.vue', 'public/icon.svg'],
      expected: {
        dependencyAudit: false,
        quality: true,
        windowsPackage: false,
      },
    },
    {
      name: 'Electron and packaged assets require the Windows package',
      paths: ['electron/main.js', 'shared/assets/fonts/example.ttf'],
      expected: {
        dependencyAudit: false,
        quality: true,
        windowsPackage: true,
      },
    },
    {
      name: 'dependency changes fail fast through audit and packaging',
      paths: ['package-lock.json'],
      expected: {
        dependencyAudit: true,
        quality: true,
        windowsPackage: true,
      },
    },
    {
      name: 'CI control-plane changes run every gate',
      paths: ['.github/workflows/ci.yml'],
      expected: {
        dependencyAudit: true,
        quality: true,
        windowsPackage: true,
      },
    },
    {
      name: 'unknown paths conservatively run every gate',
      paths: ['future-runtime/new-boundary.dat'],
      expected: {
        dependencyAudit: true,
        quality: true,
        windowsPackage: true,
      },
    },
  ])('$name', ({ expected, paths }) => {
    expect(classifyChangedPaths(paths)).toEqual(expected);
  });

  it('normalizes Windows separators before classifying paths', () => {
    expect(classifyChangedPaths(['docs\\README.md'])).toEqual({
      dependencyAudit: false,
      quality: false,
      windowsPackage: false,
    });
  });

  it.each([
    {
      name: 'draft pull request',
      input: {
        eventName: 'pull_request',
        isDraft: true,
        paths: ['electron/main.js'],
      },
      expected: {
        dependencyAudit: false,
        quality: false,
        coverage: false,
        windowsPackage: false,
      },
    },
    {
      name: 'ready documentation pull request',
      input: {
        eventName: 'pull_request',
        isDraft: false,
        paths: ['docs/spec.md'],
      },
      expected: {
        dependencyAudit: false,
        quality: false,
        coverage: false,
        windowsPackage: false,
      },
    },
    {
      name: 'ready code pull request',
      input: {
        eventName: 'pull_request',
        isDraft: false,
        paths: ['src/App.vue'],
      },
      expected: {
        dependencyAudit: false,
        quality: true,
        coverage: false,
        windowsPackage: false,
      },
    },
    {
      name: 'main documentation push',
      input: {
        eventName: 'push',
        isDraft: false,
        paths: ['docs/spec.md'],
      },
      expected: {
        dependencyAudit: false,
        quality: true,
        coverage: true,
        windowsPackage: false,
      },
    },
    {
      name: 'main dependency push',
      input: {
        eventName: 'push',
        isDraft: false,
        paths: ['package.json'],
      },
      expected: {
        dependencyAudit: true,
        quality: true,
        coverage: true,
        windowsPackage: true,
      },
    },
    {
      name: 'manual diagnostic',
      input: {
        eventName: 'workflow_dispatch',
        isDraft: false,
        paths: [],
      },
      expected: {
        dependencyAudit: true,
        quality: true,
        coverage: true,
        windowsPackage: true,
      },
    },
  ])('creates the $name execution plan', ({ expected, input }) => {
    expect(createCiPlan(input)).toEqual(expected);
  });

  it('fails safe when a non-draft run has no usable changed paths', () => {
    expect(
      createCiPlan({
        eventName: 'pull_request',
        isDraft: false,
        paths: [],
      }),
    ).toEqual({
      dependencyAudit: true,
      quality: true,
      coverage: false,
      windowsPackage: true,
    });
  });

  it('collects deleted and pre-rename paths for conservative classification', () => {
    let gitArguments;
    const paths = readChangedPaths(
      'a'.repeat(40),
      'b'.repeat(40),
      (_command, arguments_) => {
        gitArguments = arguments_;
        return {
          status: 0,
          stdout: 'electron/main.js\0docs/retired-main.md\0',
        };
      },
    );

    expect(gitArguments).toContain('--diff-filter=ACDMRTUXB');
    expect(gitArguments).toContain('--no-renames');
    expect(paths).toEqual(['electron/main.js', 'docs/retired-main.md']);
    expect(classifyChangedPaths(paths).windowsPackage).toBe(true);
  });

  it('serializes stable lowercase GitHub output flags', () => {
    expect(
      formatGitHubOutputs({
        dependencyAudit: true,
        quality: true,
        coverage: false,
        windowsPackage: false,
      }),
    ).toBe(
      [
        'dependency_audit=true',
        'quality=true',
        'coverage=false',
        'windows_package=false',
      ].join('\n'),
    );
  });
});
