'use strict';

const {
  collectElectronSnapshot,
  sampleCpuPercent,
  sampleMemoryPercent,
} = require('../lib/appUsage');
const { selectDescendantPids } = require('./childProcessUsageSampler');

// Electron's getAppMetrics() is a cheap in-process read; sampling child
// processes needs a PowerShell round-trip, so that part only runs while a
// heavy job is active (see isHeavyJobActive below) rather than on every tick.
const DEFAULT_INTERVAL_MS = 3000;

function createAppUsageService({
  getAppMetrics,
  cpuCount,
  totalMemoryBytes,
  isHeavyJobActive = () => false,
  sampleChildProcessTree = async () => [],
  rootPid = process.pid,
  publishStatus = () => undefined,
  scheduleInterval = setInterval,
  clearIntervalFn = clearInterval,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = Date.now,
  logger = console,
} = {}) {
  let timer = null;
  let inFlight = false;
  // Map<pid, {cpuSeconds, workingSetBytes}> — combined Electron + (while a
  // heavy job runs) child process snapshot from the previous tick.
  let previousSnapshot = null;
  let previousSampledAt = null;
  let status = { cpuPercent: null, ramPercent: null };

  function getStatus() {
    return { ...status };
  }

  function toCpuSecondsMap(snapshot) {
    const map = new Map();
    if (!snapshot) return map;
    for (const [pid, entry] of snapshot) map.set(pid, entry.cpuSeconds);
    return map;
  }

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    try {
      const sampledAt = now();
      const snapshot = collectElectronSnapshot(getAppMetrics());

      if (isHeavyJobActive()) {
        const rows = await sampleChildProcessTree();
        const descendantPids = new Set(
          selectDescendantPids(rows, rootPid, snapshot.keys()),
        );
        for (const row of rows) {
          if (!descendantPids.has(row.pid)) continue;
          snapshot.set(row.pid, {
            cpuSeconds: row.cpuSeconds,
            workingSetBytes: row.workingSetBytes,
          });
        }
      }

      const elapsedMs =
        previousSampledAt == null ? null : sampledAt - previousSampledAt;
      const cpuPercent =
        elapsedMs == null
          ? null
          : sampleCpuPercent(
              toCpuSecondsMap(previousSnapshot),
              toCpuSecondsMap(snapshot),
              elapsedMs,
              cpuCount,
            );

      let usedBytes = 0;
      for (const entry of snapshot.values()) usedBytes += entry.workingSetBytes;
      const ramPercent = sampleMemoryPercent(usedBytes, totalMemoryBytes);

      previousSnapshot = snapshot;
      previousSampledAt = sampledAt;

      status = { cpuPercent, ramPercent };
      publishStatus(getStatus());
    } catch (error) {
      logger.error?.('[app-usage] sample failed', error);
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    previousSnapshot = collectElectronSnapshot(getAppMetrics());
    previousSampledAt = now();
    timer = scheduleInterval(tick, intervalMs);
    timer?.unref?.();
  }

  function stop() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
    previousSnapshot = null;
    previousSampledAt = null;
  }

  return { start, stop, getStatus };
}

module.exports = { createAppUsageService };
