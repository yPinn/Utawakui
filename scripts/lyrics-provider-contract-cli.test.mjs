import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runContractCli } from './lyrics-provider-contract-cli.mjs';
import { loadContractCassette } from './lyrics-provider-contracts.mjs';

const folders = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    fs.rmSync(folder, { recursive: true, force: true });
});
function root() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-contract-cli-'));
  folders.push(folder);
  return folder;
}

describe('provider contract CLI', () => {
  it.each([
    [],
    ['record'],
    ['record', 'unknown'],
    ['replay', 'lrclib', 'https://example.com'],
  ])('rejects unsupported arguments %j without requests', async (...args) => {
    const fetch = vi.fn();
    await expect(runContractCli(args, { fetch, root: root() })).rejects.toThrow(
      /Usage/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records only sanitized files to the private evidence folder', async () => {
    const directory = root();
    const item = {
      id: 42,
      trackName: 'Secret title',
      artistName: 'Secret artist',
      duration: 180,
      instrumental: false,
      syncedLyrics: '[00:01.00]Secret words',
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([item])))
      .mockResolvedValueOnce(new Response(JSON.stringify(item)));
    const result = await runContractCli(['record', 'lrclib'], {
      root: directory,
      fetch,
    });
    expect(result).toMatchObject({
      provider: 'lrclib',
      mode: 'record',
      searchCount: 1,
      detail: 'ok',
    });
    const filename = path.join(
      directory,
      '.benchmarks',
      'lyrics-provider-contracts',
      result.filename,
    );
    const data = loadContractCassette(filename);
    expect(data.records).toHaveLength(2);
    expect(fs.readFileSync(filename, 'utf8')).not.toMatch(
      /Secret|Cookie|https:/,
    );
    expect(fs.existsSync(path.join(directory, 'scripts'))).toBe(false);
  });

  it('does not save failed probes and does not silently skip missing replay files', async () => {
    const directory = root();
    await expect(
      runContractCli(['record', 'netease'], {
        root: directory,
        fetch: async () => new Response('{}'),
      }),
    ).rejects.toThrow(/schema/);
    expect(fs.existsSync(path.join(directory, '.benchmarks'))).toBe(false);
    await expect(
      runContractCli(['replay', 'netease'], { root: directory }),
    ).rejects.toThrow();
  });

  it.each(['lrclib', 'netease'])(
    'replays checked-in %s through the CLI without transport',
    async (provider) => {
      const fetch = vi.fn(() => {
        throw new Error('network forbidden');
      });
      expect(
        await runContractCli(['replay', provider], { fetch }),
      ).toMatchObject({ provider, mode: 'replay', detail: 'ok' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('runs the executable CLI and bounds both usage and failure output', () => {
    const script = fileURLToPath(
      new URL('./lyrics-provider-contract-cli.mjs', import.meta.url),
    );
    const success = spawnSync(process.execPath, [script, 'replay', 'lrclib'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(success.status).toBe(0);
    expect(JSON.parse(success.stdout)).toMatchObject({
      mode: 'replay',
      detail: 'ok',
    });
    const invalid = spawnSync(
      process.execPath,
      [script, 'invalid', 'private-secret'],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Usage:');
    expect(invalid.stderr).not.toContain('private-secret');
  });
});
