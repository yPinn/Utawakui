'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Win32_Process's KernelModeTime/UserModeTime are FILETIME-style 100ns ticks.
const CPU_TICKS_PER_SECOND = 10_000_000;
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

function resolvePowerShellPath() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const windowsPowerShell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return fs.existsSync(windowsPowerShell)
    ? windowsPowerShell
    : 'powershell.exe';
}

// PowerShell's ConvertTo-Json emits a bare object (not a one-element array)
// when the pipeline only produced a single row — normalize both shapes.
function parseChildProcessRows(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => row && Number.isFinite(row.ProcessId))
    .map((row) => ({
      pid: row.ProcessId,
      ppid: Number.isFinite(row.ParentProcessId) ? row.ParentProcessId : null,
      cpuSeconds:
        ((Number(row.KernelModeTime) || 0) + (Number(row.UserModeTime) || 0)) /
        CPU_TICKS_PER_SECOND,
      workingSetBytes: Number(row.WorkingSetSize) || 0,
    }));
}

// Walks the local process tree from rootPid down (BFS over ParentProcessId
// links) and returns every descendant pid not already covered by
// excludePids — i.e. Utawakui's own Electron processes (browser/renderer/GPU/
// utility), which app.getAppMetrics() already accounts for. What's left is
// the real child process tree: Python (vocal separation), FFmpeg, and
// anything they spawn.
function selectDescendantPids(rows, rootPid, excludePids) {
  const exclude = new Set(excludePids || []);
  const childrenByParent = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.ppid == null) continue;
    if (!childrenByParent.has(row.ppid)) childrenByParent.set(row.ppid, []);
    childrenByParent.get(row.ppid).push(row.pid);
  }

  const result = [];
  const visited = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    for (const childPid of childrenByParent.get(pid) || []) {
      if (visited.has(childPid)) continue;
      visited.add(childPid);
      queue.push(childPid);
      if (!exclude.has(childPid)) result.push(childPid);
    }
  }
  return result;
}

// Queries the full local process table once via CIM/WMI. Only worth the cost
// while a heavy job (vocal separation) is actually running — see
// appUsageService.js's isHeavyJobActive gate. Resolves to [] on any failure
// (missing PowerShell, timeout, malformed output) so a sampling hiccup never
// breaks the Electron-side reading.
function queryProcessTree({
  execFileImpl = execFile,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console,
} = {}) {
  return new Promise((resolve) => {
    execFileImpl(
      resolvePowerShellPath(),
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, KernelModeTime, UserModeTime, WorkingSetSize | ConvertTo-Json -Compress',
      ],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: DEFAULT_MAX_BUFFER,
      },
      (error, stdout) => {
        if (error) {
          logger.error?.('[app-usage] child process query failed', error);
          resolve([]);
          return;
        }
        resolve(parseChildProcessRows(stdout));
      },
    );
  });
}

module.exports = {
  parseChildProcessRows,
  selectDescendantPids,
  queryProcessTree,
};
