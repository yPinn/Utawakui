import {
  mkdirSync,
  mkdtempSync,
  lstatSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AUDIT_ROOT,
  collectAuditSources,
  sha256,
} from './outputAppearanceAudit.mjs';
import { launchAuditChild } from './output-appearance-audit.mjs';
import {
  parseProbeArguments,
  collectProbeRuntimeFiles,
} from './outputPerformanceProbe.mjs';

export async function runPerformanceProbe(args = process.argv.slice(2)) {
  const options = parseProbeArguments(args);
  const tasks = path.join(AUDIT_ROOT, 'tasks');
  mkdirSync(tasks, { recursive: true });
  if (lstatSync(tasks).isSymbolicLink())
    throw Error('Probe directory must be real');
  const dir = mkdtempSync(path.join(tasks, 'output-appearance-audit-f5-'));
  const source = collectAuditSources();
  source.files = collectProbeRuntimeFiles().map((file) => ({
    file,
    sha256: sha256(readFileSync(path.join(AUDIT_ROOT, file))),
  }));
  for (const { file, sha256: expected } of source.files) {
    const bytes = readFileSync(path.join(AUDIT_ROOT, file));
    if (sha256(bytes) !== expected)
      throw Error('Source changed while freezing');
    const destination = path.join(dir, 'runtime-inputs', file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  mkdirSync(path.join(dir, 'tool-source'));
  for (const file of [
    'scripts/outputPerformanceProbe.mjs',
    'scripts/output-performance-probe.mjs',
    'scripts/output-performance-driver.cjs',
  ]) {
    source.files.push({
      file,
      sha256: sha256(readFileSync(path.join(AUDIT_ROOT, file))),
    });
    writeFileSync(
      path.join(dir, 'tool-source', path.basename(file)),
      readFileSync(path.join(AUDIT_ROOT, file)),
    );
  }
  writeFileSync(
    path.join(dir, 'request.json'),
    JSON.stringify(options, null, 2),
  );
  let report = {
    schemaVersion: 1,
    phase: 'F5',
    status: 'running',
    source,
    options,
    checks: [],
    samples: [],
    errors: [],
    startedAt: new Date().toISOString(),
  };
  const save = () =>
    writeFileSync(
      path.join(dir, 'report.json'),
      JSON.stringify(report, null, 2),
    );
  save();
  console.log(`Output F5: ${path.relative(AUDIT_ROOT, dir)}`);
  try {
    const result = await launchAuditChild({
      dir,
      entryName: 'output-performance-driver.cjs',
      timeoutMs:
        options.mode === 'soak' ? options.minutes * 60000 + 120000 : 600000,
    });
    report = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'));
    if (result.reason || result.code !== 0 || report.status === 'running') {
      report.errors.push(result.reason ?? 'probe-process-failed');
      report.status =
        result.reason === 'cancelled' || report.status === 'cancelled'
          ? 'cancelled'
          : 'failed';
    }
  } catch (error) {
    report.status = 'failed';
    report.errors.push(String(error.message).slice(0, 400));
  }
  const profile = path.join(dir, 'profile');
  if (path.dirname(dir) !== tasks || path.dirname(profile) !== dir)
    throw Error('Invalid profile cleanup');
  try {
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    report.profileCleanup = 'passed';
  } catch {
    report.profileCleanup = 'failed';
    report.status = 'failed';
  }
  save();
  console.log(
    JSON.stringify({
      status: report.status,
      report: path.relative(AUDIT_ROOT, path.join(dir, 'report.json')),
    }),
  );
  process.exitCode = report.status === 'passed' ? 0 : 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runPerformanceProbe().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
