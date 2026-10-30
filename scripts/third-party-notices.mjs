import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as asar from '@electron/asar';

const browserRuntimeRoots = [
  '@lucide/vue',
  'gsap',
  'opencc-js',
  'signalsmith-stretch',
  'vue',
  'vue-i18n',
];
const noticeName =
  /^(?:licen[cs]e|copying|notice|third[-_]party[-_](?:notices|licenses))(?:[._-]|$)/iu;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function boundedPath(root, relative) {
  const resolved = path.resolve(root, relative);
  if (
    path.isAbsolute(relative) ||
    !resolved.startsWith(`${path.resolve(root)}${path.sep}`)
  ) {
    throw new Error(`Invalid notice path: ${relative}`);
  }
  return resolved;
}

function resolvePackage(packages, name, from = '') {
  const parts = from.split('/').filter(Boolean);
  while (parts.length) {
    const candidate = `${parts.join('/')}/node_modules/${name}`;
    if (packages[candidate]) return candidate;
    parts.pop();
  }
  return packages[`node_modules/${name}`] ? `node_modules/${name}` : null;
}

function supportsWindows(meta) {
  return [
    ['os', 'win32'],
    ['cpu', 'x64'],
  ].every(([key, value]) => {
    const values = meta[key];
    return (
      !values ||
      (!values.includes(`!${value}`) &&
        (!values.some((item) => !item.startsWith('!')) ||
          values.includes(value)))
    );
  });
}

function dependencyClosure(packages, browserRoots) {
  const seen = new Set();
  function visit(name, from = '', optional = false) {
    const key = resolvePackage(packages, name, from);
    if (!key) {
      if (optional) return;
      throw new Error(`Missing locked dependency: ${name}`);
    }
    const meta = packages[key];
    if (seen.has(key) || !supportsWindows(meta)) return;
    seen.add(key);
    for (const dependency of Object.keys(meta.dependencies || {}))
      visit(dependency, key);
    for (const dependency of Object.keys(meta.optionalDependencies || {}))
      visit(dependency, key, true);
  }
  for (const name of [
    ...Object.keys(packages[''].dependencies || {}),
    ...browserRoots,
  ])
    visit(name);
  return [...seen].sort();
}

function installedNoticeFiles(directory) {
  const result = [];
  function walk(location) {
    for (const entry of fs.readdirSync(location, { withFileTypes: true })) {
      const filename = path.join(location, entry.name);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile()) result.push(filename);
    }
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!noticeName.test(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (entry.isFile()) result.push(filename);
  }
  // Some published packages put their complete permission notice in README.
  if (result.length === 0) {
    for (const entry of fs.readdirSync(directory)) {
      if (!/^readme(?:\.|$)/iu.test(entry)) continue;
      const filename = path.join(directory, entry);
      if (
        fs.statSync(filename).isFile() &&
        fs
          .readFileSync(filename, 'utf8')
          .includes('Permission is hereby granted')
      )
        result.push(filename);
    }
  }
  return result.sort();
}

function reviewedFiles(root, files = []) {
  return files.map((file) => {
    const bytes = fs.readFileSync(
      boundedPath(path.join(root, 'third-party'), file.path),
    );
    if (hash(bytes) !== file.sha256)
      throw new Error(`Reviewed notice checksum changed: ${file.path}`);
    return {
      path: `third-party/${file.path}`,
      sha256: file.sha256,
      source: file.source,
      text: bytes.toString('utf8'),
    };
  });
}

export function collectThirdPartyNotices(
  root,
  { browserRoots = browserRuntimeRoots } = {},
) {
  const lock = readJson(path.join(root, 'package-lock.json')).packages;
  const policy = readJson(path.join(root, 'third-party/reviewed-sources.json'));
  if (policy.schemaVersion !== 1)
    throw new Error('Unsupported notice source schema');
  const reviewed = new Map(policy.packages.map((item) => [item.path, item]));
  for (const item of policy.packages) {
    if (lock[item.path]?.version !== item.version)
      throw new Error(`Unreviewed version: ${item.path}`);
  }
  const texts = [];
  const packages = dependencyClosure(lock, browserRoots).map((key) => {
    const meta = lock[key];
    const directory = boundedPath(root, key);
    const installed = readJson(path.join(directory, 'package.json'));
    if (installed.version !== meta.version)
      throw new Error(`Installed version differs from lock: ${key}`);
    const extra = reviewed.get(key);
    const files = [
      ...installedNoticeFiles(directory).map((filename) => {
        const bytes = fs.readFileSync(filename);
        return {
          path: path.relative(root, filename).split(path.sep).join('/'),
          sha256: hash(bytes),
          source: meta.resolved || key,
          text: bytes.toString('utf8'),
        };
      }),
      ...reviewedFiles(root, extra?.files),
    ];
    if (files.length === 0)
      throw new Error(`Missing full license/notice text: ${key}`);
    const name = installed.name || key.replace(/^node_modules\//u, '');
    texts.push(
      `Package: ${name} ${meta.version}\nLock path: ${key}\nLicense: ${extra?.license || installed.license || meta.license}\n`,
    );
    for (const file of files)
      texts.push(
        `Source: ${file.source}\nFile: ${file.path}\nSHA-256: ${file.sha256}\n\n${file.text}\n`,
      );
    return {
      path: key,
      name,
      version: meta.version,
      integrity: meta.integrity || null,
      files: files.map(({ path: filename, sha256, source }) => ({
        path: filename,
        sha256,
        source,
      })),
    };
  });
  const additional = policy.additional.map((item) => {
    if (lock[item.owner.path]?.version !== item.owner.version)
      throw new Error(`Unreviewed version for ${item.id}`);
    const files = reviewedFiles(root, item.files);
    texts.push(
      `Additional component: ${item.id} ${item.version}\n${item.note || ''}\n`,
    );
    for (const file of files)
      texts.push(
        `Source: ${file.source}\nFile: ${file.path}\nSHA-256: ${file.sha256}\n\n${file.text}\n`,
      );
    for (const artifact of item.artifacts || []) {
      if (
        hash(fs.readFileSync(boundedPath(root, artifact.sourcePath))) !==
        artifact.sha256
      )
        throw new Error(`Unreviewed artifact checksum: ${item.id}`);
    }
    return {
      ...item,
      files: files.map(({ path: filename, sha256, source }) => ({
        path: filename,
        sha256,
        source,
      })),
    };
  });
  const text = [
    'UTAWAKUI — COMPLETE THIRD-PARTY LICENSE AND ATTRIBUTION TEXTS',
    'Target: Windows x64. Package versions are pinned by the accompanying manifest.',
    'The browser root dependency closure is conservative and can include build-time dependencies.',
    'Upstream aggregate notices may cover additional platforms or components; inclusion does not imply that every named component is shipped.',
    'This collection does not grant rights to music, lyrics, artwork, or external services.',
    '',
    ...texts,
  ].join('\n');
  const preservedFiles = (policy.preservedFiles || []).map((file) => ({
    ...file,
    sha256: hash(fs.readFileSync(boundedPath(root, file.sourcePath))),
  }));
  return {
    manifest: {
      schemaVersion: 1,
      target: 'win32-x64',
      packages,
      additional,
      preservedFiles,
      noticeSha256: hash(text),
    },
    text,
  };
}

export function writeThirdPartyNotices(root, options) {
  const { manifest, text } = collectThirdPartyNotices(root, options);
  fs.writeFileSync(path.join(root, 'third-party/NOTICES.txt'), text);
  fs.writeFileSync(
    path.join(root, 'third-party/manifest.json'),
    json(manifest),
  );
  return manifest;
}

export function verifyThirdPartyNotices(root, options) {
  const { manifest, text } = collectThirdPartyNotices(root, options);
  if (
    fs.readFileSync(path.join(root, 'third-party/NOTICES.txt'), 'utf8') !==
      text ||
    fs.readFileSync(path.join(root, 'third-party/manifest.json'), 'utf8') !==
      json(manifest)
  ) {
    throw new Error(
      'Third-party notice collection is stale or changed; review sources and run license:write',
    );
  }
  return manifest;
}

export function verifyPackagedThirdPartyNotices(root, appOutDir, options) {
  const manifest = verifyThirdPartyNotices(root, options);
  const resources = path.join(appOutDir, 'resources');
  for (const name of ['manifest.json', 'NOTICES.txt']) {
    if (
      !fs
        .readFileSync(path.join(resources, 'third-party', name))
        .equals(fs.readFileSync(path.join(root, 'third-party', name)))
    )
      throw new Error(`Missing or changed packaged third-party ${name}`);
  }
  const archive = path.join(resources, 'app.asar');
  const entries = asar.listPackage(archive);
  const archiveNames = new Map(
    entries.map((entry) => [
      entry.replaceAll('\\', '/').replace(/^\//u, ''),
      entry.slice(1),
    ]),
  );
  for (const file of manifest.preservedFiles) {
    const bytes =
      file.location === 'asar'
        ? asar.extractFile(archive, archiveNames.get(file.targetPath))
        : fs.readFileSync(boundedPath(appOutDir, file.targetPath));
    if (hash(bytes) !== file.sha256)
      throw new Error(
        `Missing or changed preserved notice/asset: ${file.targetPath}`,
      );
  }
  // electron-builder can hoist nested packages to a different node_modules
  // path. Coverage follows identity/version, while the manifest retains every
  // original lock path and its integrity/source records.
  const packages = new Set(
    manifest.packages.map((item) => `${item.name}@${item.version}`),
  );
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/').replace(/^\//u, '');
    if (
      !/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*\/package\.json$/u.test(
        normalized,
      )
    )
      continue;
    const key = normalized.slice(0, -'/package.json'.length);
    const delivered = JSON.parse(
      asar.extractFile(archive, entry.slice(1)).toString('utf8'),
    );
    if (!packages.has(`${delivered.name}@${delivered.version}`))
      throw new Error(`Uncovered packaged dependency version: ${key}`);
  }
  for (const item of manifest.additional) {
    for (const artifact of item.artifacts || []) {
      if (
        hash(fs.readFileSync(boundedPath(appOutDir, artifact.packagedPath))) !==
        artifact.sha256
      )
        throw new Error(`Changed packaged artifact: ${item.id}`);
    }
  }
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const root = path.resolve(import.meta.dirname, '..');
  const args = process.argv.slice(2);
  const manifest =
    args.length === 1 && args[0] === '--write'
      ? writeThirdPartyNotices(root)
      : args.length === 2 && args[0] === '--app-out-dir'
        ? verifyPackagedThirdPartyNotices(root, path.resolve(args[1]))
        : args.length === 0
          ? verifyThirdPartyNotices(root)
          : null;
  if (!manifest)
    throw new Error(
      'Usage: third-party-notices.mjs [--write | --app-out-dir <directory>]',
    );
  console.log(
    `Verified complete notices for ${manifest.packages.length} package entries and ${manifest.additional.length} additional components.`,
  );
}
