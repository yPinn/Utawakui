import { spawn, execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import electronPath from 'electron';
import {
  AUDIT_ROOT,
  buildAuditPlan,
  collectAuditSources,
  createAuditReport,
  parseAuditArguments,
  settleAuditReport,
} from './outputAppearanceAudit.mjs';

export function preflightAuditAssets(
  files = [
    'overlay/lyrics/index.html',
    'overlay/setlist/index.html',
    'overlay/now-playing/index.html',
    'scripts/fixtures/output/appearance-baseline.json',
    'scripts/fixtures/output/scenarios.json',
  ],
) {
  for (const file of files)
    if (!existsSync(path.join(AUDIT_ROOT, file)))
      throw Error(`Missing audit asset: ${file}`);
}

export function launchAuditChild({
  dir,
  spawnChild = spawn,
  signals = process,
  timeoutMs = 180000,
  graceMs = 5000,
  terminate,
  entryName = 'output-appearance-capture.cjs',
}) {
  if (
    ![
      'output-appearance-capture.cjs',
      'output-performance-driver.cjs',
    ].includes(entryName)
  )
    return Promise.reject(Error('Unknown audit entry'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve) => {
    let child,
      reason = null,
      finished = false,
      forceTimer,
      deadline,
      logBytes = 0;
    const log = (chunk) => {
      const bytes = Buffer.from(chunk).subarray(
        0,
        Math.max(0, 1048576 - logBytes),
      );
      if (bytes.length) {
        writeFileSync(path.join(dir, 'process.log'), bytes, { flag: 'a' });
        logBytes += bytes.length;
      }
    };
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(forceTimer);
      signals.removeListener('SIGINT', cancel);
      signals.removeListener('SIGTERM', cancel);
      resolve({ code: code ?? 1, reason });
    };
    const stop = (why) => {
      if (reason || finished) return;
      reason = why;
      writeFileSync(path.join(dir, 'cancel'), why);
      forceTimer = setTimeout(() => {
        if (terminate) terminate(child);
        else if (process.platform === 'win32') {
          // Only this spawned process tree; never kill all Electron instances.
          try {
            execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              stdio: 'ignore',
            });
          } catch {
            child.kill();
          }
        } else child.kill('SIGKILL');
      }, graceMs);
    };
    const cancel = () => stop('cancelled');
    signals.on('SIGINT', cancel);
    signals.on('SIGTERM', cancel);
    try {
      child = spawnChild(
        electronPath,
        [path.join(AUDIT_ROOT, 'scripts', entryName), dir],
        {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          cwd: AUDIT_ROOT,
        },
      );
      child.stdout.on('data', log);
      child.stderr.on('data', log);
      child.on('error', () => {
        reason = 'spawn-failed';
        finish(1);
      });
      child.on('close', finish);
      deadline = setTimeout(() => stop('timed-out'), timeoutMs);
    } catch {
      reason = 'spawn-failed';
      finish(1);
    }
  });
}

function removeAuditProfile(dir, tasks) {
  const profile = path.join(dir, 'profile');
  if (path.dirname(profile) !== dir || path.dirname(dir) !== tasks)
    throw Error('Invalid audit cleanup target');
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

export async function runAudit(
  args = process.argv.slice(2),
  {
    launch = launchAuditChild,
    collect = collectAuditSources,
    preflight = preflightAuditAssets,
  } = {},
) {
  const options = parseAuditArguments(args);
  const plan = buildAuditPlan(options);
  if (options.list) {
    console.log(
      JSON.stringify(
        {
          cases: plan.cases.map(
            ({ templateId, scenarioId, captureStatus, reason }) => ({
              templateId,
              scenarioId,
              captureStatus,
              reason,
            }),
          ),
          limits:
            '--template and --scenario accept comma-separated registered ids; no arbitrary paths or URLs',
        },
        null,
        2,
      ),
    );
    return null;
  }
  const tasks = path.join(AUDIT_ROOT, 'tasks');
  mkdirSync(tasks, { recursive: true });
  if (lstatSync(tasks).isSymbolicLink())
    throw Error('Audit directory must be a real workspace directory');
  const dir = mkdtempSync(path.join(tasks, 'output-appearance-audit-'));
  const report = createAuditReport(plan, {
    commit: null,
    dirty: null,
    files: [],
    status: 'not-collected',
  });
  writeFileSync(
    path.join(dir, 'request.json'),
    JSON.stringify(options, null, 2),
  );
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Output audit: ${path.relative(AUDIT_ROOT, dir)}`);
  let final = report;
  try {
    preflight();
    report.source = collect();
    writeFileSync(
      path.join(dir, 'report.json'),
      JSON.stringify(report, null, 2),
    );
    const result = await launch({ dir });
    final = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'));
    if (result.reason || result.code !== 0 || final.status === 'running') {
      final.errors.push(result.reason ?? 'capture-process-failed');
      settleAuditReport(
        final,
        result.reason === 'cancelled' || final.status === 'cancelled'
          ? 'cancelled'
          : 'failed',
      );
    }
  } catch (error) {
    final.errors.push(String(error.message).slice(0, 400));
    settleAuditReport(final, 'failed');
  } finally {
    // Fixed owned path, verified before recursive removal; retained artifacts are siblings.
    try {
      removeAuditProfile(dir, tasks);
      final.profileCleanup = 'passed';
    } catch {
      final.profileCleanup = 'failed';
      final.errors.push('profile-cleanup-failed');
      final.status = 'failed';
    }
    writeFileSync(
      path.join(dir, 'report.json'),
      JSON.stringify(final, null, 2),
    );
  }
  console.log(
    JSON.stringify(
      {
        status: final.status,
        passed: final.cases.filter((r) => r.captureStatus === 'passed').length,
        failed: final.cases.filter((r) => r.captureStatus === 'failed').length,
        notTested: final.cases.filter((r) => r.captureStatus === 'not-tested')
          .length,
        report: path.relative(AUDIT_ROOT, path.join(dir, 'report.json')),
      },
      null,
      2,
    ),
  );
  process.exitCode = ['passed', 'not-tested'].includes(final.status) ? 0 : 1;
  return final;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runAudit().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
