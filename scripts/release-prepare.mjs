import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import semver from 'semver';

// Sections whose wording rarely changes between releases; copied from the previous notes.
const CARRIED_SECTIONS = ['安裝前須知', 'Before Installing'];

function fail(message) {
  throw new Error(`[release:prepare] ${message}`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeJson(filePath, value) {
  const original = readText(filePath);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const text = `${JSON.stringify(value, null, 2)}\n`.replaceAll('\n', eol);
  fs.writeFileSync(filePath, text);
}

export function extractCopyBlock(templateText) {
  const match = /```markdown\r?\n([\s\S]*?)\r?\n```\s*$/u.exec(templateText);
  if (!match) fail('release-notes template has no markdown copy block');
  return match[1];
}

function splitSections(text) {
  const sections = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/u)) {
    const heading = /^##\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      current = heading[1];
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return sections;
}

function trimSectionBody(lines) {
  const body = [];
  for (const line of lines) {
    if (line.trim() === '---' || line.trim().startsWith('<!--')) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

// Replaces each carried section's body with the previous release's wording.
export function carryStableSections(scaffold, previousNotes) {
  if (!previousNotes) return scaffold;
  const previous = splitSections(previousNotes);
  let result = scaffold;
  for (const heading of CARRIED_SECTIONS) {
    if (!previous.has(heading)) continue;
    const body = trimSectionBody(previous.get(heading));
    if (!body) continue;
    const pattern = new RegExp(
      `(^## ${heading}\\r?\\n\\r?\\n)([\\s\\S]*?)(?=\\r?\\n\\r?\\n(?:<!--|---|## )|\\s*(?![\\s\\S]))`,
      'mu',
    );
    result = result.replace(pattern, (_, start) => `${start}${body}`);
  }
  return result;
}

function previousNotesPath(releasesDirectory, version) {
  const candidates = fs
    .readdirSync(releasesDirectory)
    .map((name) => /^v(\d+\.\d+\.\d+)\.md$/u.exec(name)?.[1])
    .filter((value) => value && semver.lt(value, version))
    .sort(semver.rcompare);
  return candidates[0]
    ? path.join(releasesDirectory, `v${candidates[0]}.md`)
    : null;
}

// The latest release is the only every-run baseline; earlier ones survive only as boundaries.
export function rotateBaselines(baselines, latest) {
  const boundaries = baselines
    .filter((entry) => entry.boundary && entry.version !== latest.version)
    .map((entry) => ({ ...entry, everyRun: false }));
  return [
    ...boundaries,
    { version: latest.version, sha256: latest.sha256, everyRun: true },
  ].sort((a, b) => semver.compare(a.version, b.version));
}

function defaultRunGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

export function publishedInstallerSha256({ repository, version, runGh }) {
  const sums = runGh([
    'release',
    'download',
    `v${version}`,
    '--repo',
    repository,
    '--pattern',
    'SHA256SUMS.txt',
    '--output',
    '-',
  ]);
  const installer = `Utawakui-Setup-${version}.exe`;
  const line = sums
    .split(/\r?\n/u)
    .find((entry) => entry.trim().endsWith(installer));
  const sha256 = line?.trim().split(/\s+/u)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256 ?? '')) {
    fail(`no published SHA-256 for ${installer}`);
  }
  return sha256;
}

export function prepareRelease({
  rootDirectory,
  version,
  runGh = defaultRunGh,
}) {
  if (
    !version ||
    semver.valid(version) !== version ||
    semver.prerelease(version)
  ) {
    fail('expected a stable version such as 0.6.0');
  }
  const packagePath = path.join(rootDirectory, 'package.json');
  const lockPath = path.join(rootDirectory, 'package-lock.json');
  const packageJson = JSON.parse(readText(packagePath));
  if (!semver.gt(version, packageJson.version)) {
    fail(`version must be greater than the current ${packageJson.version}`);
  }

  // Network first, so a failed lookup leaves no partial edits.
  const { releaseRepository } = JSON.parse(
    readText(path.join(rootDirectory, 'shared/appUpdateValues.json')),
  );
  const baselinesPath = path.join(
    rootDirectory,
    'scripts/release-baselines.json',
  );
  const baselines = rotateBaselines(JSON.parse(readText(baselinesPath)), {
    version: packageJson.version,
    sha256: publishedInstallerSha256({
      repository: releaseRepository,
      version: packageJson.version,
      runGh,
    }),
  });

  const lock = JSON.parse(readText(lockPath));
  packageJson.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  writeJson(packagePath, packageJson);
  writeJson(lockPath, lock);
  writeJson(baselinesPath, baselines);

  const releasesDirectory = path.join(rootDirectory, 'docs/releases');
  const notesPath = path.join(releasesDirectory, `v${version}.md`);
  let notesCreated = false;
  if (!fs.existsSync(notesPath)) {
    const template = readText(
      path.join(rootDirectory, 'docs/operations/release-notes-template.md'),
    );
    const previousPath = previousNotesPath(releasesDirectory, version);
    const scaffold = carryStableSections(
      extractCopyBlock(template).replaceAll('<version>', version),
      previousPath ? readText(previousPath) : null,
    );
    fs.writeFileSync(notesPath, `${scaffold}\n`);
    notesCreated = true;
  }

  const announcementPath = path.join(
    rootDirectory,
    'shared/releaseAnnouncement.json',
  );
  const announcement = JSON.parse(readText(announcementPath));
  announcement.version = version;
  announcement.summary = { 'zh-TW': '', 'en-US': '' };
  writeJson(announcementPath, announcement);

  return { notesCreated, notesPath };
}

function main() {
  const [version] = process.argv.slice(2);
  const { notesCreated, notesPath } = prepareRelease({
    rootDirectory: process.cwd(),
    version,
  });
  const relativeNotes = path.relative(process.cwd(), notesPath);
  process.stdout.write(
    [
      `Prepared v${version}.`,
      notesCreated
        ? `Created ${relativeNotes}; fill every <...> placeholder.`
        : `Kept existing ${relativeNotes}.`,
      'Copy both short summaries into shared/releaseAnnouncement.json.',
      'The previous release is now the every-run CI upgrade baseline.',
      `Then commit, tag v${version} on main, and push the tag.`,
      '',
    ].join('\n'),
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
