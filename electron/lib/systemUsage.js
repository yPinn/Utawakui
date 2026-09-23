'use strict';

function cpuTicksTotal(cpu) {
  return Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
}

// os.cpus() ticks are cumulative since boot, so a single read can't produce
// an instantaneous rate — the caller must keep the previous snapshot and
// pass it back in on the next sample. Returns null until there's a previous
// snapshot to diff against, or if the two snapshots aren't comparable (core
// count changed, no time elapsed).
function sampleCpuPercent(previousCpus, currentCpus) {
  if (
    !Array.isArray(previousCpus) ||
    !Array.isArray(currentCpus) ||
    previousCpus.length !== currentCpus.length ||
    currentCpus.length === 0
  ) {
    return null;
  }

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < currentCpus.length; i += 1) {
    const idle = currentCpus[i].times.idle - previousCpus[i].times.idle;
    const total =
      cpuTicksTotal(currentCpus[i]) - cpuTicksTotal(previousCpus[i]);
    if (total <= 0) continue;
    idleDelta += idle;
    totalDelta += total;
  }
  if (totalDelta <= 0) return null;

  const busy = 1 - idleDelta / totalDelta;
  return Math.round(Math.min(1, Math.max(0, busy)) * 100);
}

function sampleMemoryPercent({ totalmem, freemem }) {
  const total = totalmem();
  const free = freemem();
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) {
    return null;
  }
  const used = Math.max(0, total - free);
  return Math.round(Math.min(1, used / total) * 100);
}

module.exports = { sampleCpuPercent, sampleMemoryPercent };
