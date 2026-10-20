// F5 development workload. It never drives a real player, library or OBS instance.
import {
  createOutputPreviewSnapshot,
  createOutputPreviewScene,
} from '../shared/presentation/outputPreviewScene.mjs';
import { buildAuditProjection } from './outputAppearanceAudit.mjs';
import { AUDIT_ROOT } from './outputAppearanceAudit.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire, isBuiltin } from 'node:module';
import outputTemplates from '../shared/outputTemplateValues.json' with { type: 'json' };

// Check the served module graph, not just files on disk. A valid import can still
// be absent from the server's explicit route allowlist during parallel edits.
export async function inspectProbeModuleGraph(
  baseUrl,
  kinds,
  fetchModule = fetch,
) {
  const origin = new URL(baseUrl).origin;
  const pending = [...new Set(kinds)].map(
    (kind) => `/overlay/${kind}/${kind}.mjs`,
  );
  const visited = new Set();
  const failures = [];
  while (pending.length) {
    const route = pending.shift();
    if (visited.has(route)) continue;
    if (visited.size >= 256) {
      failures.push({ route, reason: 'module-limit' });
      break;
    }
    visited.add(route);
    try {
      const response = await fetchModule(`${origin}${route}`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (response.status !== 200) {
        failures.push({ route, reason: `HTTP ${response.status}` });
        continue;
      }
      if (
        !(response.headers.get('content-type') ?? '').includes(
          'text/javascript',
        )
      ) {
        failures.push({ route, reason: 'content-type' });
        continue;
      }
      const source = await response.text();
      for (const match of source.matchAll(
        /\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?['"]([^'"]+)['"]/g,
      )) {
        const specifier = match[1];
        const url = new URL(specifier, `${origin}${route}`);
        if (
          url.origin !== origin ||
          (!specifier.startsWith('.') && !specifier.startsWith('/'))
        ) {
          failures.push({ route, reason: 'external-import' });
          continue;
        }
        pending.push(url.pathname);
      }
    } catch {
      failures.push({ route, reason: 'fetch-failed' });
    }
  }
  return {
    status: failures.length ? 'failed' : 'passed',
    routes: [...visited],
    failures,
  };
}

export function collectProbeRuntimeFiles(root = AUDIT_ROOT) {
  const seen = new Set();
  function visit(file) {
    file = path.resolve(file);
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative))
      throw Error('Output dependency outside workspace');
    if (seen.has(relative)) return;
    seen.add(relative);
    const ext = path.extname(file);
    if (!['.js', '.cjs', '.mjs', '.html', '.css'].includes(ext)) return;
    const text = readFileSync(file, 'utf8');
    let references;
    if (ext === '.html')
      references = [...text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
    else if (ext === '.css')
      references = [
        ...text.matchAll(
          /url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g,
        ),
      ].map((m) => m[1] ?? m[2]);
    else
      references = [
        ...text.matchAll(
          /\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']|\b(?:require(?:\.resolve)?|import)\(\s*["']([^"']+)["']\s*\)/g,
        ),
      ].map((m) => m[1] ?? m[2]);
    for (let reference of references) {
      if (
        reference.startsWith('data:') ||
        reference.startsWith('#') ||
        isBuiltin(reference)
      )
        continue;
      if (reference === '/overlay/vendor/gsap.min.js')
        reference = createRequire(file).resolve('gsap/dist/gsap.min.js');
      let target;
      if (reference.startsWith('/overlay/') || reference.startsWith('/shared/'))
        target = path.join(root, reference.slice(1));
      else if (reference.startsWith('/workbench/'))
        target = path.join(root, 'overlay', reference.slice(1));
      else if (reference.startsWith('.') || path.isAbsolute(reference)) {
        const base = path.resolve(path.dirname(file), reference);
        target = [
          base,
          base + '.js',
          base + '.json',
          path.join(base, 'index.js'),
        ].find((p) => existsSync(p));
        if (!target) throw Error('Missing Output input: ' + reference);
      } else {
        try {
          target = createRequire(file).resolve(reference);
        } catch {
          continue;
        }
      }
      visit(target);
    }
  }
  for (const file of [
    'electron/lib/outputServer.js',
    'overlay/lyrics/index.html',
    'overlay/setlist/index.html',
    'overlay/now-playing/index.html',
    'package.json',
    'package-lock.json',
    'scripts/fixtures/output/scenarios.json',
    'scripts/fixtures/output/appearance-baseline.json',
  ])
    visit(path.join(root, file));
  return [...seen].sort();
}

export function parseProbeArguments(args) {
  const options = { mode: 'integration', minutes: 5 };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i],
      value = args[i + 1];
    if (seen.has(flag)) throw Error('Duplicate probe option');
    seen.add(flag);
    if (
      flag === '--template' &&
      value &&
      value
        .split(',')
        .every((id) => Object.hasOwn(outputTemplates.templateKinds, id)) &&
      new Set(value.split(',')).size === value.split(',').length
    )
      options.templates = value.split(',');
    else if (
      flag === '--mode' &&
      ['integration', 'soak', 'baseline'].includes(value)
    )
      options.mode = value;
    else if (
      flag === '--minutes' &&
      /^\d+$/.test(value ?? '') &&
      Number(value) >= 1 &&
      Number(value) <= 60
    )
      options.minutes = Number(value);
    else throw Error('Unknown or invalid probe option');
  }
  if (options.templates && options.mode !== 'baseline')
    throw Error('Template selection requires baseline mode');
  return options;
}

export function createPerformanceProjection({
  state = 'playing',
  elapsedMs = 0,
  revision = 1,
  nowMs = Date.now(),
  sourceStatus = 'ready',
  bootId = 'probe-boot',
  sourceEpoch = 'probe-epoch',
  positionMs,
} = {}) {
  if (
    !['playing', 'paused', 'empty'].includes(state) ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  )
    throw Error('Invalid synthetic workload');
  const snapshot = createOutputPreviewSnapshot();
  const index = Math.floor(elapsedMs / 32000);
  snapshot.generatedAt = new Date(nowMs).toISOString();
  const track = {
    id: `probe-track-${index}`,
    title: `合成測試曲 ${index}`,
    artist: '合成演唱者',
  };
  snapshot.playback = {
    ...snapshot.playback,
    status: state === 'empty' ? 'idle' : state,
    positionMs: positionMs ?? (state === 'paused' ? 5000 : elapsedMs % 32000),
    track,
  };
  snapshot.lyrics.trackId = track.id;
  if (index > 0) {
    snapshot.lyrics.lines[0].text = `合成確認${index}`;
    delete snapshot.lyrics.reading;
  }
  snapshot.queue.items = snapshot.queue.items.map((item) =>
    item.state === 'current' ? { ...item, track } : item,
  );
  if (state === 'empty') {
    snapshot.playback = {
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      rate: 1,
      track: null,
    };
    snapshot.lyrics = null;
    snapshot.queue.items = [];
  }
  const p = buildAuditProjection(snapshot, sourceStatus);
  p.bootId = bootId;
  p.sourceEpoch = sourceStatus === 'unavailable' ? null : sourceEpoch;
  p.snapshot.revision = revision;
  const contentRevision = index + 1;
  p.streams.queue.revision = contentRevision;
  p.streams.queue.document.documentId = `probe-queue-${index}`;
  p.streams.lyrics.revision = p.streams.lyrics.document ? contentRevision : 0;
  if (p.streams.lyrics.document)
    p.streams.lyrics.document.documentId = `probe-lyrics-${index}`;
  p.streams.state.revision = revision;
  Object.assign(p.streams.state.payload.lyrics, {
    documentId: p.streams.lyrics.document?.documentId ?? null,
    documentRevision: p.streams.lyrics.revision,
  });
  p.streams.state.payload.queue = {
    documentId: p.streams.queue.document.documentId,
    documentRevision: contentRevision,
  };
  return p;
}

export function probeExpectedText(row, snapshot) {
  const frame = createOutputPreviewScene({
    kind: row.kind,
    templateId: row.templateId,
    settings: row.settings,
    snapshot,
    nowMs: Date.parse(snapshot.generatedAt),
  }).frame;
  return row.kind === 'lyrics'
    ? row.templateId === 'karaoke-stack'
      ? frame.ktv.currentText
      : row.templateId === 'kinetic-pop'
        ? frame.kineticPop.displayText
        : frame.currentText
    : row.kind === 'setlist'
      ? frame.current?.title
      : frame.title;
}

export function summarizeAlpha(bitmap) {
  if (bitmap.length % 4 !== 0) throw Error('Invalid BGRA bitmap');
  const result = {
    pixels: bitmap.length / 4,
    transparent: 0,
    partial: 0,
    opaque: 0,
  };
  for (let i = 3; i < bitmap.length; i += 4) {
    if (bitmap[i] === 0) result.transparent++;
    else if (bitmap[i] === 255) result.opaque++;
    else result.partial++;
  }
  return result;
}

const sum = (rows, pick) =>
  rows.length && rows.every((r) => Number.isFinite(pick(r)))
    ? rows.reduce((a, r) => a + pick(r), 0)
    : null;
export function readMetrics(processes, status) {
  return {
    cpuPercent: sum(processes, (p) => p.cpu?.percentCPUUsage),
    workingSetKb: sum(processes, (p) => p.memory?.workingSetSize),
    privateBytesKb: sum(processes, (p) => p.memory?.privateBytes),
    gpuProcessWorkingSetKb: sum(
      processes.filter((p) => p.type === 'GPU'),
      (p) => p.memory?.workingSetSize,
    ),
    gpuVramKb: null,
    processCount: processes.length,
    clients: Number.isFinite(status.clients) ? status.clients : null,
    queuedBytes: Number.isFinite(status.delivery?.queuedBytes)
      ? status.delivery.queuedBytes
      : null,
    droppedMessages: Number.isFinite(status.delivery?.droppedMessages)
      ? status.delivery.droppedMessages
      : null,
    replacedMessages: Number.isFinite(status.delivery?.replacedMessages)
      ? status.delivery.replacedMessages
      : null,
    disconnectedClients: Number.isFinite(status.delivery?.disconnectedClients)
      ? status.delivery.disconnectedClients
      : null,
  };
}

function describe(rows, key) {
  const values = rows.map((r) => r[key]).filter(Number.isFinite);
  if (!values.length) return null;
  return {
    samples: values.length,
    first: values[0],
    last: values.at(-1),
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    delta: values.at(-1) - values[0],
  };
}
export function summarizeSamples(samples, warmupMs = 60000) {
  const describeGroup = (rows) => ({
    samples: rows.length,
    ...Object.fromEntries(
      [
        'cpuPercent',
        'workingSetKb',
        'privateBytesKb',
        'gpuProcessWorkingSetKb',
        'queuedBytes',
      ].map((key) => [key, describe(rows, key)]),
    ),
  });
  return {
    budgets: null,
    warmup: describeGroup(samples.filter((r) => r.elapsedMs < warmupMs)),
    steady: describeGroup(samples.filter((r) => r.elapsedMs >= warmupMs)),
    method:
      'Descriptive time-series ranges; no independent-run percentile or leak claim',
  };
}
