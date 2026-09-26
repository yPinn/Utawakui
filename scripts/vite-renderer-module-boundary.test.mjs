import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
let server;

beforeAll(async () => {
  server = await createServer({
    root: repositoryRoot,
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  });
});

afterAll(async () => {
  await server?.close();
});

describe('Vite renderer module boundary', () => {
  it('serves the OBS settings validator as native browser ESM', async () => {
    const composable = await readFile(
      fileURLToPath(
        new URL(
          '../src/composables/useObsIntegrationSettings.js',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const contract = await server.transformRequest(
      '/shared/obsConnectionContract.mjs',
    );

    expect(composable).toContain('../../shared/obsConnectionContract.mjs');
    expect(contract?.code).toMatch(
      /export\s+(?:function\s+isValidObsHost|\{[^}]*isValidObsHost)/u,
    );
    expect(contract?.code).not.toContain('module.exports');
  });
});
