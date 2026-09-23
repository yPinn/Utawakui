'use strict';

const { sampleCpuPercent, sampleMemoryPercent } = require('../lib/systemUsage');

// spec.md §7.2 item 1 asks for "低頻率輪詢" (low-frequency polling) — os.cpus()
// and totalmem/freemem are synchronous, in-process reads with no subprocess
// spawn, so 3s is frequent enough to notice contention early without being
// wasteful.
const DEFAULT_INTERVAL_MS = 3000;

function createSystemUsageService({
  os,
  publishStatus = () => undefined,
  scheduleInterval = setInterval,
  clearIntervalFn = clearInterval,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console,
} = {}) {
  let timer = null;
  let previousCpus = null;
  // No GPU field — see AppTitleBar.vue's own comment for why a permanently
  // near-idle reading isn't worth surfacing.
  let status = { cpuPercent: null, ramPercent: null };

  function getStatus() {
    return { ...status };
  }

  function tick() {
    try {
      const currentCpus = os.cpus();
      const cpuPercent = sampleCpuPercent(previousCpus, currentCpus);
      previousCpus = currentCpus;
      const ramPercent = sampleMemoryPercent(os);
      status = { ...status, cpuPercent, ramPercent };
      publishStatus(getStatus());
    } catch (error) {
      logger.error?.('[system-usage] sample failed', error);
    }
  }

  function start() {
    if (timer) return;
    previousCpus = os.cpus();
    timer = scheduleInterval(tick, intervalMs);
    timer?.unref?.();
  }

  function stop() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
    previousCpus = null;
  }

  return { start, stop, getStatus };
}

module.exports = { createSystemUsageService };
