import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createContractRecorder,
  createContractReplay,
  loadContractCassette,
  probeProvider,
  saveContractCassette,
} from './lyrics-provider-contracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export async function runContractCli(args, options = {}) {
  const [mode, provider] = args;
  if (
    args.length !== 2 ||
    !['record', 'replay'].includes(mode) ||
    !['lrclib', 'netease'].includes(provider)
  )
    throw new Error(
      'Usage: node scripts/lyrics-provider-contract-cli.mjs <record|replay> <lrclib|netease>',
    );
  const root = options.root ?? ROOT;
  if (mode === 'replay') {
    const cassette = loadContractCassette(
      path.join(
        root,
        'scripts',
        'fixtures',
        'lyrics-provider-contracts',
        `${provider}.json`,
      ),
    );
    if (cassette.provider !== provider)
      throw new Error('contract provider mismatch');
    const replay = createContractReplay(cassette);
    const result = await probeProvider(provider, {
      fetch: replay.fetch,
      scheduler: { schedule: (operation) => operation(), deferFor: () => {} },
    });
    replay.assertConsumed();
    return { provider, mode, ...result };
  }
  const recorder = createContractRecorder(
    provider,
    options.fetch ?? globalThis.fetch,
  );
  const result = await probeProvider(provider, { fetch: recorder.fetch });
  const folder = path.join(root, '.benchmarks', 'lyrics-provider-contracts');
  fs.mkdirSync(folder, { recursive: true });
  const filename = `${provider}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  saveContractCassette(path.join(folder, filename), recorder.snapshot());
  return { provider, mode, ...result, filename };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runContractCli(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        error.message.startsWith('Usage:')
          ? error.message
          : 'Provider contract failed; no raw response was saved.',
      );
      process.exitCode = 1;
    });
}
