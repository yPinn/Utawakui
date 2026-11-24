import { describe, expect, it } from 'vitest';
import {
  BASE_IMAGE,
  CI_CHECKOUT_DIR,
  CONTAINER_SCRIPT,
  DOCKERFILE,
  LINUX_TEST_IMAGE,
  buildLinuxVitestDockerArgs,
  selectCheckoutFiles,
} from './linux-vitest.mjs';

describe('Linux Vitest container', () => {
  it('streams the checkout on stdin and forwards Vitest arguments as positionals', () => {
    const args = buildLinuxVitestDockerArgs([
      'electron/lib/a.test.js',
      '$(touch pwned)',
    ]);

    expect(args).toContain('-i');
    expect(args.some((arg) => arg.includes(':/src'))).toBe(false);
    expect(args).toContain(LINUX_TEST_IMAGE);
    expect(args.slice(-3)).toEqual([
      'linux-vitest',
      'electron/lib/a.test.js',
      '$(touch pwned)',
    ]);
  });

  it('matches the CI runner Node, Electron libraries, checkout path and install', () => {
    expect(BASE_IMAGE).toBe('node:24-bookworm');
    expect(DOCKERFILE).toContain(`FROM ${BASE_IMAGE}`);
    expect(DOCKERFILE).toContain('libnspr4');
    expect(LINUX_TEST_IMAGE).toMatch(/^utawakui-linux-test:[0-9a-f]{12}$/u);
    expect(CI_CHECKOUT_DIR).toBe('/home/runner/work/Utawakui/Utawakui');
    expect(CONTAINER_SCRIPT).toContain('set -eo pipefail');
    expect(CONTAINER_SCRIPT).toContain(`tar -xf - -C ${CI_CHECKOUT_DIR}`);
    expect(CONTAINER_SCRIPT).toContain('commit -q --no-verify -m snapshot');
    expect(CONTAINER_SCRIPT).toContain('npm ci ');
    expect(CONTAINER_SCRIPT).toContain('npx vitest run "$@"');
  });

  it('skips empty entries and tracked files deleted from the working tree', () => {
    const present = new Set(['a.js', 'dir/b with space.js']);
    expect(
      selectCheckoutFiles('a.js\0gone.js\0dir/b with space.js\0', (file) =>
        present.has(file),
      ),
    ).toEqual(['a.js', 'dir/b with space.js']);
  });
});
