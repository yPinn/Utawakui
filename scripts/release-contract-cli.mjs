import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  verifyArtifactContract,
  verifyReleaseNotes,
  verifyVersionContract,
} from './release-contract.mjs';

function assertOption(condition, message) {
  if (!condition) throw new Error(`[release] ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function optionValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  assertOption(args[index + 1], `${name} requires a value`);
  return args[index + 1];
}

function run(args) {
  const [command] = args;
  const rootDirectory = path.resolve(
    optionValue(args, '--root', process.cwd()),
  );

  if (command === 'version') {
    const tag = optionValue(args, '--tag', process.env.GITHUB_REF_NAME);
    assertOption(tag, '--tag is required');
    const version = verifyVersionContract({
      packageJson: readJson(path.join(rootDirectory, 'package.json')),
      packageLock: readJson(path.join(rootDirectory, 'package-lock.json')),
      tag,
    });
    const notesPath = optionValue(args, '--notes');
    if (notesPath) verifyReleaseNotes(path.resolve(rootDirectory, notesPath));
    process.stdout.write(`${version}\n`);
    return;
  }

  if (command === 'artifacts') {
    const version = optionValue(args, '--version');
    assertOption(version, '--version is required');
    const directory = path.resolve(
      rootDirectory,
      optionValue(args, '--directory', 'release'),
    );
    const result = verifyArtifactContract({ directory, version });
    process.stdout.write(
      `Verified ${result.installerName}, blockmap, and latest.yml\n`,
    );
    return;
  }

  throw new Error('[release] Expected command: version or artifacts');
}

try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
