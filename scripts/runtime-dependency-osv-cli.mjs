import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  OSV_QUERY_BATCH_URL,
  RUNTIME_MANIFEST_PATHS,
  buildOsvQuery,
  collectPypiPackages,
  collectUncheckedArtifacts,
  findingsFromOsvResponse,
  formatReport,
} from './runtime-dependency-osv.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readManifests() {
  return RUNTIME_MANIFEST_PATHS.flatMap((relativePath) => {
    const target = path.join(rootDirectory, relativePath);
    if (!fs.statSync(target).isDirectory()) return [readJson(target)];
    return fs
      .readdirSync(target)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJson(path.join(target, name)));
  });
}

const packages = collectPypiPackages(readManifests());
const response = await fetch(OSV_QUERY_BATCH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(buildOsvQuery(packages)),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`[osv] query failed with HTTP ${response.status}`);
}
const findings = findingsFromOsvResponse(packages, await response.json());
const report = formatReport({
  packages,
  findings,
  unchecked: collectUncheckedArtifacts(
    readJson(path.join(rootDirectory, 'shared/featureDependencies.json')),
  ),
});

process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
process.exitCode = findings.length > 0 ? 1 : 0;
