import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_CLIENT_MARKER_HEADER,
  FEEDBACK_SUBMIT_PATH,
  MAX_DIAGNOSTICS_EVENT_COUNT,
} from './constants.js';

const require = createRequire(import.meta.url);
const appContract = require('../../../electron/lib/feedback/constants.js');
const wranglerConfig = readFileSync(
  new URL('../wrangler.toml', import.meta.url),
  'utf8',
);
const relayPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const relayReadme = readFileSync(
  new URL('../README.md', import.meta.url),
  'utf8',
);

describe('feedback production deployment contract', () => {
  it('keeps the app endpoint on the canonical Worker path', () => {
    const endpoint = new URL(appContract.DEFAULT_FEEDBACK_ENDPOINT);
    expect(endpoint.origin).toBe('https://api.utawakui.llazypilot.com');
    expect(endpoint.pathname).toBe(FEEDBACK_SUBMIT_PATH);
    expect(appContract.FEEDBACK_CLIENT_MARKER_HEADER).toBe(
      FEEDBACK_CLIENT_MARKER_HEADER,
    );
  });

  it('keeps the public Worker marker aligned with the desktop client', () => {
    expect(wranglerConfig).toContain(
      `CLIENT_MARKER = "${appContract.FEEDBACK_CLIENT_MARKER}"`,
    );
    expect(wranglerConfig).not.toContain('CLIENT_TOKEN');
  });

  it('keeps the diagnostics event ceiling aligned with the desktop client', () => {
    expect(MAX_DIAGNOSTICS_EVENT_COUNT).toBe(
      appContract.DIAGNOSTICS_EVENT_LIMIT,
    );
  });

  it('pins the provisioned production KV binding without a placeholder', () => {
    expect(wranglerConfig).toContain('binding = "RATE_LIMIT_KV"');
    expect(wranglerConfig).toContain('id = "9511a39e34b74370841c6a05a0e06713"');
    expect(wranglerConfig).not.toContain('REPLACE_WITH_KV_NAMESPACE_ID');
  });

  it('publishes only through the product custom domain', () => {
    expect(wranglerConfig).toContain('workers_dev = false');
    expect(wranglerConfig).toContain('pattern = "api.utawakui.llazypilot.com"');
    expect(wranglerConfig).toContain('custom_domain = true');
  });

  it('uses one reproducible Wrangler v4 version in metadata and runbook', () => {
    expect(relayPackage.devDependencies.wrangler).toBe('4.131.2');
    expect(relayReadme).toContain('wrangler@4.131.2');
    expect(relayReadme).not.toContain('wrangler@3.90.0');
  });

  it('keeps an independent lockfile for reproducible Worker deployment', () => {
    const lockUrl = new URL('../package-lock.json', import.meta.url);
    expect(existsSync(lockUrl)).toBe(true);

    const lock = JSON.parse(readFileSync(lockUrl, 'utf8'));
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.packages[''].devDependencies.wrangler).toBe('4.131.2');
    expect(lock.packages['node_modules/wrangler'].version).toBe('4.131.2');
  });
});
