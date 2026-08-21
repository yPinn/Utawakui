import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rendererBundleRoots = Object.freeze([
  '@lucide/vue',
  '@soundtouchjs/audio-worklet',
  'vue',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function packageNameFromLockPath(lockPath) {
  return lockPath.replace(/^node_modules\//, '');
}

function readPackageJson(lockPath) {
  try {
    return readJson(path.join(lockPath, 'package.json'));
  } catch {
    return {};
  }
}

function normalizeLicense(pkg, meta) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license) return JSON.stringify(pkg.license);
  if (typeof meta.license === 'string') return meta.license;
  if (meta.license) return JSON.stringify(meta.license);
  return 'UNKNOWN';
}

function hasNoticeFile(lockPath) {
  try {
    return fs
      .readdirSync(lockPath)
      .some((name) => /^(license|licence|notice|copying)(\.|$)/i.test(name));
  } catch {
    return false;
  }
}

function buildRow(lockPath, meta) {
  const pkg = readPackageJson(lockPath);
  return {
    name: pkg.name || packageNameFromLockPath(lockPath),
    version: pkg.version || meta.version || '',
    license: normalizeLicense(pkg, meta),
    noticeFile: hasNoticeFile(lockPath),
    path: lockPath,
  };
}

function findPackagePath(lockPackages, packageName, fromPath = '') {
  const parts = fromPath.split('/').filter(Boolean);
  while (parts.length) {
    const candidate = `${parts.join('/')}/node_modules/${packageName}`;
    if (lockPackages[candidate]) return candidate;
    parts.pop();
  }

  const rootCandidate = `node_modules/${packageName}`;
  return lockPackages[rootCandidate] ? rootCandidate : null;
}

function walkDependencyClosure(lockPackages, packageName, seen, fromPath = '') {
  const packagePath = findPackagePath(lockPackages, packageName, fromPath);
  if (!packagePath || seen.has(packagePath)) return;

  seen.add(packagePath);
  const dependencies = lockPackages[packagePath].dependencies || {};
  for (const dependencyName of Object.keys(dependencies)) {
    walkDependencyClosure(lockPackages, dependencyName, seen, packagePath);
  }
}

function countByLicense(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.license, (counts.get(row.license) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function printTable(headers, rows) {
  console.log(`| ${headers.join(' | ')} |`);
  console.log(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    console.log(`| ${row.join(' | ')} |`);
  }
}

const rootDir = process.cwd();
const lock = readJson(path.join(rootDir, 'package-lock.json'));
const lockPackages = lock.packages || {};

const productionRows = Object.entries(lockPackages)
  .filter(
    ([lockPath, meta]) => lockPath.startsWith('node_modules/') && !meta.dev,
  )
  .map(([lockPath, meta]) => buildRow(lockPath, meta))
  .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

const rendererSeen = new Set();
for (const packageName of rendererBundleRoots) {
  walkDependencyClosure(lockPackages, packageName, rendererSeen);
}

const rendererRows = [...rendererSeen]
  .map((lockPath) => buildRow(lockPath, lockPackages[lockPath]))
  .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

const rootPackage = lockPackages[''] || {};

console.log('# License Inventory Report');
console.log('');
console.log(
  `Generated from package-lock ${lock.lockfileVersion || 'unknown'} in ${rootDir}.`,
);
console.log('');
console.log('## Project License');
console.log('');
console.log(`- package: ${rootPackage.name || '(unknown)'}`);
console.log(`- version: ${rootPackage.version || '(unknown)'}`);
console.log(`- license: ${rootPackage.license || 'UNDECLARED'}`);
console.log('');
console.log('## Production Dependency License Counts');
console.log('');
printTable(
  ['License', 'Count'],
  countByLicense(productionRows).map(([license, count]) => [
    license,
    String(count),
  ]),
);
console.log('');
console.log('## Production Dependency Closure');
console.log('');
printTable(
  ['Package', 'Version', 'License', 'Notice file', 'Path'],
  productionRows.map((row) => [
    row.name,
    row.version,
    row.license,
    row.noticeFile ? 'yes' : 'no',
    row.path,
  ]),
);
console.log('');
console.log('## Renderer Bundle Dependency Closure');
console.log('');
printTable(
  ['Package', 'Version', 'License', 'Notice file', 'Path'],
  rendererRows.map((row) => [
    row.name,
    row.version,
    row.license,
    row.noticeFile ? 'yes' : 'no',
    row.path,
  ]),
);
