import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import semver from 'semver';

function fail(message) {
  throw new Error(`[release:publish] ${message}`);
}

export function requiredAssets(version, signedManifestEnabled) {
  const installer = `Utawakui-Setup-${version}.exe`;
  return [
    installer,
    `${installer}.blockmap`,
    'latest.yml',
    'SHA256SUMS.txt',
    ...(signedManifestEnabled ? ['update-manifest.json'] : []),
  ];
}

function defaultRunGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

// Checks the reviewed draft and, only with confirm, makes it the stable latest release.
export function publishRelease({
  rootDirectory,
  version,
  confirm = false,
  runGh = defaultRunGh,
}) {
  if (
    !version ||
    semver.valid(version) !== version ||
    semver.prerelease(version)
  ) {
    fail('expected a stable version such as 0.6.0');
  }
  const updateValues = JSON.parse(
    fs.readFileSync(
      path.join(rootDirectory, 'shared/appUpdateValues.json'),
      'utf8',
    ),
  );
  const repository = updateValues.releaseRepository;
  const tag = `v${version}`;
  const release = JSON.parse(
    runGh([
      'release',
      'view',
      tag,
      '--repo',
      repository,
      '--json',
      'isDraft,isPrerelease,assets',
    ]),
  );

  if (!release.isDraft) fail(`${tag} is already published`);
  if (release.isPrerelease) fail(`${tag} is a prerelease`);
  const present = new Set(release.assets.map((asset) => asset.name));
  const missing = requiredAssets(
    version,
    updateValues.signedManifestEnabled,
  ).filter((name) => !present.has(name));
  if (missing.length > 0) fail(`draft is missing: ${missing.join(', ')}`);

  if (!confirm) return { published: false, repository, tag };
  runGh([
    'release',
    'edit',
    tag,
    '--repo',
    repository,
    '--draft=false',
    '--latest',
  ]);
  return { published: true, repository, tag };
}

function main() {
  const args = process.argv.slice(2);
  const version = args.find((arg) => !arg.startsWith('--'));
  const result = publishRelease({
    rootDirectory: process.cwd(),
    version,
    confirm: args.includes('--confirm'),
  });
  process.stdout.write(
    result.published
      ? `Published ${result.tag} to ${result.repository}.\n`
      : `Draft ${result.tag} is complete. After installed acceptance, rerun with --confirm to publish.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
