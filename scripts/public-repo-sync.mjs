import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Public repository path -> private source path.
export const SYNCED_FILES = {
  'README.md': 'public-repo/README.md',
  '.github/SECURITY.md': 'public-repo/.github/SECURITY.md',
  '.gitattributes': 'public-repo/.gitattributes',
  'LICENSE.md': 'LICENSE.md',
  'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
};

function fail(message) {
  throw new Error(`[public-repo-sync] ${message}`);
}

// Relative links to files the public repository lacks become plain text.
export function unlinkMissingTargets(markdown, publicPath, publishedPaths) {
  return markdown.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/gu,
    (link, label, target) => {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/iu.test(target)) return link;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(publicPath), target.split('#')[0]),
      );
      return publishedPaths.has(resolved) ? link : label;
    },
  );
}

export function buildPublicFiles(rootDirectory) {
  const publishedPaths = new Set(Object.keys(SYNCED_FILES));
  return Object.entries(SYNCED_FILES).map(([publicPath, sourcePath]) => {
    let text = fs
      .readFileSync(path.join(rootDirectory, sourcePath), 'utf8')
      .replaceAll('\r\n', '\n');
    if (publicPath.endsWith('.md')) {
      text = unlinkMissingTargets(text, publicPath, publishedPaths);
    }
    return { publicPath, text };
  });
}

function defaultRunGh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function readRemote(runGh, repository, publicPath) {
  try {
    return JSON.parse(
      runGh(['api', `repos/${repository}/contents/${publicPath}`]),
    );
  } catch (error) {
    if (/HTTP 404|Not Found/u.test(`${error.stderr ?? ''}${error.message}`)) {
      return null;
    }
    throw error;
  }
}

// Commits only files whose public copy differs; returns the updated paths.
export function syncReleaseRepository({
  rootDirectory,
  version,
  runGh = defaultRunGh,
}) {
  if (!version) fail('--version is required');
  const { releaseRepository: repository } = JSON.parse(
    fs.readFileSync(
      path.join(rootDirectory, 'shared/appUpdateValues.json'),
      'utf8',
    ),
  );
  const updated = [];
  for (const { publicPath, text } of buildPublicFiles(rootDirectory)) {
    const remote = readRemote(runGh, repository, publicPath);
    const remoteText = remote
      ? Buffer.from(remote.content, 'base64').toString('utf8')
      : null;
    if (remoteText === text) continue;
    runGh(
      [
        'api',
        '-X',
        'PUT',
        `repos/${repository}/contents/${publicPath}`,
        '--input',
        '-',
      ],
      JSON.stringify({
        message: `Sync ${publicPath} from v${version}`,
        content: Buffer.from(text, 'utf8').toString('base64'),
        ...(remote ? { sha: remote.sha } : {}),
      }),
    );
    updated.push(publicPath);
  }
  return updated;
}

function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--version');
  const updated = syncReleaseRepository({
    rootDirectory: process.cwd(),
    version: index >= 0 ? args[index + 1] : null,
  });
  process.stdout.write(
    updated.length > 0
      ? `Updated ${updated.join(', ')}\n`
      : 'Public repository files already match\n',
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
