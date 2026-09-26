#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';

import { verifyArtifactContract } from './release-contract.mjs';
import { resolveUpdateSigningPolicy } from './update-signing-policy.mjs';
import { verifySignedManifestArtifacts } from '../tools/update-signing/verify-manifest.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

function assertEvidence(condition, message) {
  if (!condition) throw new Error(`[update acceptance] ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function digest(filePath, algorithm = 'sha256') {
  return createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex');
}

function verifyInstallerChecksum(directory, installerName, expectedSha256) {
  const checksumPath = path.join(directory, 'SHA256SUMS.txt');
  let checksum;
  try {
    checksum = fs.readFileSync(checksumPath, 'utf8').trim();
  } catch {
    throw new Error('[update acceptance] Missing SHA256SUMS.txt');
  }
  const match = /^([0-9a-f]{64}) {2}(.+)$/iu.exec(checksum);
  assertEvidence(
    match && match[2] === installerName,
    'SHA256SUMS.txt must contain exactly the release installer',
  );
  assertEvidence(
    match[1].toLowerCase() === expectedSha256,
    'SHA256SUMS.txt does not match the release installer',
  );
  return checksumPath;
}

function artifactEvidence(filePath) {
  const stats = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    size: stats.size,
    sha256: digest(filePath),
  };
}

export function collectUpdateAcceptanceEvidence({
  directory,
  fromVersion,
  toVersion,
  generatedAt = new Date().toISOString(),
  updateValues,
  registry,
}) {
  assertEvidence(
    semver.valid(fromVersion) === fromVersion,
    'invalid from-version',
  );
  assertEvidence(semver.valid(toVersion) === toVersion, 'invalid to-version');
  assertEvidence(
    semver.gt(toVersion, fromVersion),
    'to-version must be newer than from-version',
  );
  assertEvidence(
    new Date(generatedAt).toISOString() === generatedAt,
    'generatedAt must be an ISO timestamp',
  );

  const artifactDirectory = path.resolve(directory);
  const contract = verifyArtifactContract({
    directory: artifactDirectory,
    version: toVersion,
  });
  const installerSha256 = digest(contract.installerPath);
  const checksumPath = verifyInstallerChecksum(
    artifactDirectory,
    contract.installerName,
    installerSha256,
  );
  const signingPolicy = resolveUpdateSigningPolicy({ updateValues, registry });
  const manifestPath = path.join(artifactDirectory, 'update-manifest.json');
  const manifestExists = fs.existsSync(manifestPath);

  if (signingPolicy.enabled) {
    assertEvidence(
      manifestExists,
      'signed manifest gate is enabled but the manifest is missing',
    );
    verifySignedManifestArtifacts({
      version: toVersion,
      expectedKeyId: signingPolicy.activeKeyId,
      requiredKeyIds: signingPolicy.retiringKeyId
        ? [signingPolicy.retiringKeyId]
        : [],
      manifestPath,
      registry,
      artifactDirectory,
    });
  } else {
    assertEvidence(
      !manifestExists,
      'signed manifest exists while the release policy is disabled',
    );
  }

  const artifactPaths = [
    contract.installerPath,
    contract.blockmapPath,
    contract.metadataPath,
    checksumPath,
  ];
  if (manifestExists) artifactPaths.push(manifestPath);

  return {
    schemaVersion: 1,
    generatedAt,
    upgradePath: { fromVersion, toVersion },
    contracts: {
      releaseBundle: 'verified',
      installerSha256: 'verified',
      signedManifest: signingPolicy.enabled ? 'verified' : 'disabled',
    },
    signing: {
      enabled: signingPolicy.enabled,
      activeKeyId: signingPolicy.activeKeyId || null,
      retiringKeyId: signingPolicy.retiringKeyId || null,
    },
    artifacts: artifactPaths.map(artifactEvidence),
    manual: {
      authenticodeStatus: 'pending',
      manualInstallerParity: 'pending',
      productionFeedUpdate: 'pending',
      dataRetention: 'pending',
      rollbackRecovery: 'pending',
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--from-version') args.fromVersion = argv[++index];
    else if (arg === '--to-version') args.toVersion = argv[++index];
    else if (arg === '--directory') args.directory = argv[++index];
    else if (arg === '--out') args.outPath = argv[++index];
    else throw new Error(`[update acceptance] Unknown argument: ${arg}`);
  }
  assertEvidence(args.fromVersion, '--from-version is required');
  assertEvidence(args.toVersion, '--to-version is required');
  assertEvidence(args.directory, '--directory is required');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = collectUpdateAcceptanceEvidence({
    ...args,
    updateValues: readJson(
      path.join(repositoryRoot, 'shared/appUpdateValues.json'),
    ),
    registry: readJson(
      path.join(repositoryRoot, 'shared/updateSigningKeys.json'),
    ),
  });
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.outPath) {
    fs.writeFileSync(path.resolve(args.outPath), output, { flag: 'wx' });
  } else {
    process.stdout.write(output);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.message || 'Evidence collection failed'}\n`);
    process.exitCode = 1;
  }
}
