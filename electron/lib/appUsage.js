'use strict';

// Turns a raw app.getAppMetrics() array into Map<pid, {cpuSeconds, workingSetBytes}>.
// cumulativeCPUUsage is seconds of CPU time since the process started — unlike
// percentCPUUsage it isn't reset by the act of calling getAppMetrics(), so
// polling it on an interval doesn't disturb any other consumer of the API
// (electron/main.js's startup trace also calls getAppMetrics()).
function collectElectronSnapshot(appMetrics) {
  const snapshot = new Map();
  for (const metric of Array.isArray(appMetrics) ? appMetrics : []) {
    if (!Number.isFinite(metric?.pid)) continue;
    const cpuSeconds = Number(metric.cpu?.cumulativeCPUUsage);
    const workingSetKb = Number(metric.memory?.workingSetSize);
    snapshot.set(metric.pid, {
      cpuSeconds: Number.isFinite(cpuSeconds) ? cpuSeconds : 0,
      workingSetBytes: Number.isFinite(workingSetKb) ? workingSetKb * 1024 : 0,
    });
  }
  return snapshot;
}

// previous/currentCpuSecondsByPid: Map<pid, cumulative cpu seconds>. Only pids
// present in both snapshots are diffed — a pid that just appeared or just
// disappeared (process started or exited between samples) contributes no
// delta for that tick instead of spiking or dipping the reading. The result
// is expressed as a percentage of the whole machine (delta seconds divided by
// elapsed wall-clock seconds times core count), the same basis Task Manager
// uses, so it's directly comparable to what the user sees there.
function sampleCpuPercent(
  previousCpuSecondsByPid,
  currentCpuSecondsByPid,
  elapsedMs,
  cpuCount,
) {
  if (
    !(previousCpuSecondsByPid instanceof Map) ||
    !(currentCpuSecondsByPid instanceof Map) ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0 ||
    !Number.isFinite(cpuCount) ||
    cpuCount <= 0
  ) {
    return null;
  }

  let cpuSecondsDelta = 0;
  for (const [pid, currentSeconds] of currentCpuSecondsByPid) {
    const previousSeconds = previousCpuSecondsByPid.get(pid);
    if (previousSeconds === undefined) continue;
    const delta = currentSeconds - previousSeconds;
    if (delta > 0) cpuSecondsDelta += delta;
  }

  const elapsedSeconds = elapsedMs / 1000;
  const percent = (cpuSecondsDelta / (elapsedSeconds * cpuCount)) * 100;
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
}

function sampleMemoryPercent(usedBytes, totalBytes) {
  if (
    !Number.isFinite(totalBytes) ||
    totalBytes <= 0 ||
    !Number.isFinite(usedBytes)
  ) {
    return null;
  }
  const percent = (Math.max(0, usedBytes) / totalBytes) * 100;
  return Math.round(Math.min(100, percent) * 100) / 100;
}

module.exports = {
  collectElectronSnapshot,
  sampleCpuPercent,
  sampleMemoryPercent,
};
