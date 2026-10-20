'use strict';
const { lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
const VARIANTS = ['normal', 'phrase-mismatch', 'missing-text', 'missing-audio'];

function conditionMetrics(items, cases, stats) {
  if (
    !Array.isArray(items) ||
    !Array.isArray(cases) ||
    !Array.isArray(stats) ||
    items.length !== cases.length ||
    cases.length !== stats.length ||
    new Set(items.map((i) => i.id)).size !== items.length ||
    items.some(
      (item, i) =>
        item.id !== cases[i].id ||
        item.id !== stats[i].id ||
        cases[i].canonical.lines.length !== stats[i].decisions.length ||
        cases[i].canonical.lines.length !==
          cases[i].estimate.preview.lines.length,
    )
  )
    throw Error('pairing metric identity');
  for (let i = 0; i < items.length; i++) {
    const item = items[i],
      c = cases[i];
    if (
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      !VARIANTS.includes(item.variant) ||
      !['zh', 'ja'].includes(item.language) ||
      !Number.isSafeInteger(item.targetIndex) ||
      item.targetIndex < 0 ||
      item.targetIndex >= c.canonical.lines.length ||
      c.canonical.lines.some((l) => typeof l.text !== 'string') ||
      c.estimate.preview.lines.some(
        (l) => typeof l.status !== 'string' || !Array.isArray(l.chunks),
      ) ||
      stats[i].decisions.some(
        (d) =>
          typeof d.reject !== 'boolean' ||
          typeof d.insertionWarning !== 'boolean' ||
          (d.missing !== undefined && typeof d.missing !== 'boolean') ||
          !(
            ['unknown', 'contradiction'].includes(d.state) || d.missing === true
          ),
      )
    )
      throw Error('pairing metric record');
  }
  const ready = (line) => line.status === 'ready' && line.chunks.length > 0;
  const normal = {
    totalLines: 0,
    readyLines: 0,
    rejectedLines: 0,
    warningLines: 0,
    unknownContentLines: 0,
  };
  const conditions = VARIANTS.map((variant) => {
    const row = {
      variant,
      total: 0,
      supported: 0,
      unsupported: 0,
      ready: 0,
      rejected: 0,
      warnings: 0,
      unknownContent: 0,
    };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.variant !== variant) continue;
      const c = cases[i],
        decisions = stats[i].decisions;
      if (variant === 'normal')
        for (let j = 0; j < c.canonical.lines.length; j++) {
          normal.totalLines++;
          normal.readyLines += Number(ready(c.estimate.preview.lines[j]));
          normal.rejectedLines += Number(decisions[j].reject);
          normal.warningLines += Number(decisions[j].insertionWarning);
          normal.unknownContentLines += Number(
            decisions[j].missing || decisions[j].state === 'unknown',
          );
        }
      row.total++;
      let supported = true;
      try {
        lexicalUnits(c.canonical.lines[item.targetIndex].text, item.language);
      } catch {
        supported = false;
      }
      if (!supported) {
        row.unsupported++;
        continue;
      }
      row.supported++;
      const d = decisions[item.targetIndex];
      row.ready += Number(ready(c.estimate.preview.lines[item.targetIndex]));
      row.rejected += Number(d.reject);
      row.warnings += Number(d.insertionWarning);
      row.unknownContent += Number(d.missing || d.state === 'unknown');
    }
    return row;
  });
  return { normal, conditions };
}

function memoryMetrics(samples) {
  let concurrent = null,
    single = null;
  const pids = new Set();
  for (const sample of samples) {
    if (!Array.isArray(sample.processes)) throw Error('memory sample');
    let sum = 0;
    const seen = new Set();
    for (const p of sample.processes) {
      if (
        seen.has(p.pid) ||
        !Number.isSafeInteger(p.workingSetBytes) ||
        p.workingSetBytes < 0 ||
        !Number.isSafeInteger(p.peakWorkingSetBytes) ||
        p.peakWorkingSetBytes < p.workingSetBytes
      )
        throw Error('memory row');
      seen.add(p.pid);
      pids.add(p.pid);
      sum += p.workingSetBytes;
      single = Math.max(single ?? 0, p.peakWorkingSetBytes);
    }
    if (seen.size) concurrent = Math.max(concurrent ?? 0, sum);
  }
  return {
    sampleCount: samples.length,
    processCount: pids.size,
    observedConcurrentWorkingSetBytes: concurrent,
    maxSingleProcessPeakWorkingSetBytes: single,
  };
}

function ownedMemorySamples(samples, rootPid) {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0)
    throw Error('memory root PID');
  let discardedRows = 0;
  const filtered = samples.map((sample) => {
    const rows = sample.processes.filter(
      (p) =>
        Number.isSafeInteger(p.pid) &&
        Number.isSafeInteger(p.workingSetBytes) &&
        Number.isSafeInteger(p.peakWorkingSetBytes),
    );
    const owned = new Set(rows.some((p) => p.pid === rootPid) ? [rootPid] : []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of rows)
        if (owned.has(p.parentPid) && !owned.has(p.pid)) {
          owned.add(p.pid);
          changed = true;
        }
    }
    const processes = rows.filter((p) => owned.has(p.pid));
    discardedRows += sample.processes.length - processes.length;
    return { ...sample, processes };
  });
  return { samples: filtered, discardedRows };
}

function assetBytes(rows) {
  const files = new Map(),
    content = new Map();
  for (const row of rows) {
    if (
      typeof row.file !== 'string' ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      throw Error('asset row');
    const prior = files.get(row.file);
    if (prior && (prior.bytes !== row.bytes || prior.sha256 !== row.sha256))
      throw Error('asset identity');
    files.set(row.file, row);
    content.set(`${row.bytes}:${row.sha256}`, row.bytes);
  }
  const logicalFileBytes = [...files.values()].reduce((n, r) => n + r.bytes, 0),
    contentUniqueBytes = [...content.values()].reduce((n, b) => n + b, 0);
  return {
    logicalFileBytes,
    contentUniqueBytes,
    duplicateCopyBytes: logicalFileBytes - contentUniqueBytes,
    fileCount: files.size,
  };
}

function findAudioClock(
  a,
  b,
  { sampleRate = 16000, maxLagSamples = 240, stride = 8 } = {},
) {
  if (
    !(a instanceof Float32Array) ||
    !(b instanceof Float32Array) ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(maxLagSamples) ||
    maxLagSamples < 0 ||
    maxLagSamples > sampleRate ||
    !Number.isSafeInteger(stride) ||
    stride < 1 ||
    Math.min(a.length, b.length) <= 2 * (maxLagSamples + 16)
  )
    throw Error('audio clock input');
  const margin = maxLagSamples + 16,
    length = Math.min(a.length, b.length);
  if (Math.ceil((length - 2 * margin) / stride) < 32)
    throw Error('audio clock insufficient pairs');
  const score = (lag) => {
    let xy = 0,
      xx = 0,
      yy = 0,
      sx = 0,
      sy = 0,
      count = 0;
    for (let i = margin; i < length - margin; i += stride) {
      const x = a[i],
        y = b[i + lag];
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw Error('audio clock sample');
      xy += x * y;
      xx += x * x;
      yy += y * y;
      sx += x;
      sy += y;
      count++;
    }
    const vx = xx - (sx * sx) / count,
      vy = yy - (sy * sy) / count;
    return vx > Math.max(xx, 1) * 1e-12 && vy > Math.max(yy, 1) * 1e-12
      ? (xy - (sx * sy) / count) / Math.sqrt(vx * vy)
      : null;
  };
  let best = { lagSamples: null, lagMs: null, correlation: null };
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
    const correlation = score(lag);
    if (
      correlation !== null &&
      (best.correlation === null || correlation > best.correlation)
    )
      best = { lagSamples: lag, lagMs: (lag * 1000) / sampleRate, correlation };
  }
  return {
    sampleRate,
    referenceSamples: a.length,
    candidateSamples: b.length,
    zeroLag: score(0),
    best,
  };
}
module.exports = {
  conditionMetrics,
  memoryMetrics,
  ownedMemorySamples,
  assetBytes,
  findAudioClock,
};
