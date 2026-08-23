'use strict';

const traceValues = require('../../shared/startupTraceValues.json');

const milestoneProcesses = new Map(Object.entries(traceValues.milestones));
const baselineMetadata = new Set(traceValues.baselineMetadata);

function invalid(path, reason) {
  throw new TypeError(`Invalid startup trace ${path}: ${reason}`);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function nonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function createStartupBaselineMetadata({
  appMetrics = [],
  gpuFeatureStatus = {},
  outputStatus = {},
} = {}) {
  const metrics = Array.isArray(appMetrics) ? appMetrics : [];
  return {
    cpuPercent: metrics.reduce(
      (total, metric) => total + nonNegative(metric?.cpu?.percentCPUUsage),
      0,
    ),
    workingSetKb: metrics.reduce(
      (total, metric) => total + nonNegative(metric?.memory?.workingSetSize),
      0,
    ),
    peakWorkingSetKb: metrics.reduce(
      (total, metric) =>
        total + nonNegative(metric?.memory?.peakWorkingSetSize),
      0,
    ),
    processCount: metrics.length,
    outputQueuedBytes: nonNegative(outputStatus?.delivery?.queuedBytes),
    outputClients: nonNegative(outputStatus?.clients),
    gpuAccelerationEnabled: gpuFeatureStatus?.gpu_compositing === 'enabled',
  };
}

function parseMetadata(name, value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('metadata', 'expected an object');
  }
  const entries = Object.entries(value);
  if (name !== 'baseline-complete' || entries.length > baselineMetadata.size) {
    invalid('metadata', 'not allowed for this milestone');
  }
  const result = {};
  for (const [key, rawValue] of entries) {
    if (!baselineMetadata.has(key)) invalid(`metadata.${key}`, 'unsupported');
    if (key === 'gpuAccelerationEnabled') {
      if (typeof rawValue !== 'boolean') {
        invalid(`metadata.${key}`, 'expected a boolean');
      }
      result[key] = rawValue;
      continue;
    }
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      invalid(`metadata.${key}`, 'expected a non-negative finite number');
    }
    result[key] = round(rawValue);
  }
  return result;
}

function parseExternalStartupMilestone(
  value,
  { expectedProcess, timeOriginMs, nowMs },
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('milestone', 'expected an object');
  }
  const process = value.process ?? expectedProcess;
  const requiredProcess = milestoneProcesses.get(value.name);
  if (!requiredProcess) invalid('name', 'unsupported milestone');
  if (process !== expectedProcess || process !== requiredProcess) {
    invalid('process', `expected ${requiredProcess}`);
  }
  if (!Number.isFinite(value.atUnixMs)) {
    invalid('atUnixMs', 'expected a finite number');
  }
  if (
    value.atUnixMs < timeOriginMs ||
    value.atUnixMs > nowMs + traceValues.maxFutureSkewMs
  ) {
    invalid('atUnixMs', 'outside this startup clock domain');
  }
  const metadata = parseMetadata(value.name, value.metadata);
  return {
    name: value.name,
    process,
    atUnixMs: round(value.atUnixMs),
    ...(metadata ? { metadata } : {}),
  };
}

function createStartupTrace({
  enabled = false,
  sessionId = null,
  timeOriginMs = 0,
  now = Date.now,
  writeLine = () => undefined,
  onError = () => undefined,
} = {}) {
  if (!enabled) {
    return {
      enabled: false,
      flush: async () => undefined,
      getRecords: () => [],
      record: () => false,
    };
  }
  if (
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    sessionId.length > 128
  ) {
    invalid('sessionId', 'expected a bounded non-empty string');
  }
  if (!Number.isFinite(timeOriginMs) || timeOriginMs < 0) {
    invalid('timeOriginMs', 'expected a non-negative finite number');
  }

  const seen = new Set();
  const records = [];
  let writeQueue = Promise.resolve();

  function record(name, options = {}) {
    if (seen.has(name)) return false;
    const parsed = parseExternalStartupMilestone(
      { name, ...options },
      {
        expectedProcess: milestoneProcesses.get(name),
        timeOriginMs,
        nowMs: now(),
      },
    );
    const entry = {
      version: traceValues.version,
      sessionId,
      name: parsed.name,
      process: parsed.process,
      atUnixMs: parsed.atUnixMs,
      elapsedMs: round(parsed.atUnixMs - timeOriginMs),
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
    };
    seen.add(name);
    records.push(entry);
    const line = JSON.stringify(entry);
    writeQueue = writeQueue
      .then(() => writeLine(line))
      .catch((error) => onError(error));
    return true;
  }

  return {
    enabled: true,
    flush: () => writeQueue.then(() => undefined),
    getRecords: () => structuredClone(records),
    record,
  };
}

function readStartupTraceOptions(argv = []) {
  const enabled = argv.includes(traceValues.flag);
  const fileArg = argv.find((value) =>
    value.startsWith(traceValues.fileFlagPrefix),
  );
  const filePath = fileArg
    ? fileArg.slice(traceValues.fileFlagPrefix.length) || null
    : null;
  return {
    enabled,
    exitOnComplete: enabled && argv.includes(traceValues.exitFlag),
    filePath: enabled ? filePath : null,
  };
}

function registerStartupTraceHandler({
  ipcMain,
  trace,
  getAllowedSender,
  onInvalid = () => undefined,
}) {
  if (!trace?.enabled) return false;
  ipcMain.on('startup-trace:milestone', (event, value) => {
    if (event.sender !== getAllowedSender()) return;
    try {
      trace.record(value?.name, {
        process: 'renderer',
        atUnixMs: value?.atUnixMs,
      });
    } catch (error) {
      onInvalid(error);
    }
  });
  return true;
}

module.exports = {
  createStartupBaselineMetadata,
  createStartupTrace,
  parseExternalStartupMilestone,
  readStartupTraceOptions,
  registerStartupTraceHandler,
};
