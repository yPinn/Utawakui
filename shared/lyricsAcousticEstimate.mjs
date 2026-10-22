import timingValues from './lyricsTimingValues.json' with { type: 'json' };
import { validateLyricsFineTiming } from './lyricsFineTiming.mjs';

export const ACOUSTIC_ESTIMATE_SCHEMA_VERSION = 2;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const SHA = /^[a-f0-9]{64}$/u;
const REASONS = new Set([
  'unsupported-language',
  'missing-boundaries',
  'unresolved-interval',
  'no-evidence',
]);
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function fail() {
  throw new Error('Invalid acoustic estimate');
}
function record(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
  return value;
}
function id(value) {
  if (
    typeof value !== 'string' ||
    value.length > timingValues.maxIdLength ||
    !ID.test(value)
  )
    fail();
  return value;
}
function sha(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !SHA.test(value)) fail();
  return value;
}
function time(value, nullable = false) {
  if (nullable && value === null) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > timingValues.maxTimeMs
  )
    fail();
  return value;
}
function boundaries(text) {
  return new Set([
    0,
    ...Array.from(
      graphemes.segment(text),
      (part) => part.index + part.segment.length,
    ),
  ]);
}

export function validateAcousticEstimate(raw) {
  if (
    new globalThis.TextEncoder().encode(JSON.stringify(raw)).length >
    timingValues.maxDocumentBytes
  )
    fail();
  record(raw, [
    'schemaVersion',
    'estimateId',
    'documentId',
    'source',
    'audio',
    'method',
    'lines',
  ]);
  if (![1, ACOUSTIC_ESTIMATE_SCHEMA_VERSION].includes(raw.schemaVersion))
    fail();
  const source = record(raw.source, [
    'filename',
    'sha256',
    'normalizerProfileId',
    'timingSha256',
    'intervalsSha256',
    'offsetUsedMs',
  ]);
  if (
    typeof source.filename !== 'string' ||
    source.filename.length > 240 ||
    /[<>:"/\\|?*\p{Cc}]/u.test(source.filename) ||
    !/^[^.].*\.(?:lrc|vtt)$/iu.test(source.filename) ||
    !Number.isSafeInteger(source.offsetUsedMs) ||
    Math.abs(source.offsetUsedMs) > 3600000
  )
    fail();
  const audio = record(raw.audio, ['sha256', 'role', 'decodeProfileId']);
  if (audio.role !== 'mix') fail(); // Guide identity/recipe is a later producer contract.
  const method = record(raw.method, [
    'kind',
    'id',
    'version',
    'modelManifestSha256',
    'environmentLockSha256',
    'decoderVersion',
    'g2pVersion',
    'chunkerVersion',
    'nodeVersion',
    'icuVersion',
  ]);
  if (!['fixture', 'model'].includes(method.kind)) fail();
  const normalizedMethod = Object.fromEntries(
    Object.entries(method).map(([key, value]) => [
      key,
      key.endsWith('Sha256')
        ? sha(value, method.kind === 'fixture')
        : id(value),
    ]),
  );
  if (
    method.kind === 'fixture' &&
    (method.modelManifestSha256 !== null ||
      method.environmentLockSha256 !== null)
  )
    fail();
  const lines = validateAcousticEstimateLines(raw.lines, {
    allowFine: raw.schemaVersion === 2,
  });
  return {
    schemaVersion: raw.schemaVersion,
    estimateId: id(raw.estimateId),
    documentId: id(raw.documentId),
    source: {
      filename: source.filename,
      sha256: sha(source.sha256),
      normalizerProfileId: id(source.normalizerProfileId),
      timingSha256: sha(source.timingSha256, true),
      intervalsSha256: sha(source.intervalsSha256),
      offsetUsedMs: source.offsetUsedMs,
    },
    audio: {
      sha256: sha(audio.sha256),
      role: audio.role,
      decodeProfileId: id(audio.decodeProfileId),
    },
    method: normalizedMethod,
    lines,
  };
}

export function validateAcousticEstimateLines(
  rawLines,
  { allowFine = true } = {},
) {
  if (
    !Array.isArray(rawLines) ||
    !rawLines.length ||
    rawLines.length > timingValues.maxLines ||
    new globalThis.TextEncoder().encode(JSON.stringify(rawLines)).length >
      timingValues.maxDocumentBytes
  )
    fail();
  const used = new Set();
  let previousStart = -1;
  let total = 0;
  const unique = (value) => {
    const result = id(value);
    if (used.has(result)) fail();
    used.add(result);
    return result;
  };
  return rawLines.map((rawLine) => {
    const line = record(rawLine, [
      'lineId',
      'text',
      'startMs',
      'endMs',
      'status',
      'reason',
      'chunks',
      ...(allowFine && Object.hasOwn(rawLine ?? {}, 'fineTiming')
        ? ['fineTiming']
        : []),
    ]);
    const lineId = unique(line.lineId);
    if (
      typeof line.text !== 'string' ||
      !line.text.length ||
      line.text.length > timingValues.maxTextLength
    )
      fail();
    const startMs = time(line.startMs, true),
      endMs = time(line.endMs, true);
    if (
      (startMs === null && endMs !== null) ||
      (endMs !== null && endMs < startMs)
    )
      fail();
    if (startMs !== null) {
      if (startMs < previousStart) fail();
      previousStart = startMs;
    }
    if (
      !['ready', 'unsupported'].includes(line.status) ||
      !Array.isArray(line.chunks) ||
      line.chunks.length > timingValues.maxSegmentsPerLine
    )
      fail();
    total += line.chunks.length;
    if (total > timingValues.maxTotalSegments) fail();
    if (line.status === 'unsupported') {
      if (
        !REASONS.has(line.reason) ||
        line.chunks.length ||
        line.fineTiming !== undefined
      )
        fail();
      return {
        lineId,
        text: line.text,
        startMs,
        endMs,
        status: line.status,
        reason: line.reason,
        chunks: [],
      };
    }
    if (
      line.reason !== null ||
      startMs === null ||
      endMs === null ||
      endMs <= startMs ||
      line.chunks.length < 2
    )
      fail();
    const safe = boundaries(line.text);
    let offset = 0;
    let previous = -1;
    const chunks = line.chunks.map((rawChunk) => {
      const chunk = record(rawChunk, ['chunkId', 'from', 'to', 'startMs']);
      const chunkId = unique(chunk.chunkId),
        chunkStart = time(chunk.startMs);
      if (
        chunk.from !== offset ||
        !safe.has(chunk.from) ||
        !safe.has(chunk.to) ||
        chunk.to <= chunk.from ||
        chunkStart <= previous ||
        chunkStart < startMs ||
        chunkStart >= endMs ||
        (offset === 0 && chunkStart !== startMs)
      )
        fail();
      offset = chunk.to;
      previous = chunkStart;
      return { chunkId, from: chunk.from, to: chunk.to, startMs: chunkStart };
    });
    if (offset !== line.text.length) fail();
    const fineTiming =
      line.fineTiming === undefined
        ? undefined
        : validateLyricsFineTiming(line.fineTiming, line);
    for (const unit of fineTiming?.units ?? []) unique(unit.unitId);
    total += fineTiming?.units.length ?? 0;
    if (total > timingValues.maxTotalSegments) fail();
    return {
      lineId,
      text: line.text,
      startMs,
      endMs,
      status: 'ready',
      reason: null,
      chunks,
      ...(fineTiming ? { fineTiming } : {}),
    };
  });
}

// Producer helper: retain text-only cuts only when a usable internal start exists.
// A missing cut extends the previous chunk; it never creates an interpolated time.
export function buildAcousticChunks(
  text,
  cuts,
  starts,
  startMs,
  endMs,
  lineId,
) {
  id(lineId);
  time(startMs);
  time(endMs);
  const safe = boundaries(text);
  if (
    !Array.isArray(cuts) ||
    cuts[0] !== 0 ||
    cuts.at(-1) !== text.length ||
    cuts.some(
      (cut, index) => !safe.has(cut) || (index > 0 && cut <= cuts[index - 1]),
    )
  )
    fail();
  if (endMs <= startMs) return null;
  const chunks = [
    { chunkId: `${lineId}-c-0`, from: 0, to: text.length, startMs },
  ];
  for (const cut of cuts.slice(1, -1)) {
    const candidate = starts.get(cut);
    if (
      !Number.isSafeInteger(candidate) ||
      candidate <= chunks.at(-1).startMs ||
      candidate >= endMs
    )
      continue;
    chunks.at(-1).to = cut;
    chunks.push({
      chunkId: `${lineId}-c-${cut.toString(36)}`,
      from: cut,
      to: text.length,
      startMs: candidate,
    });
  }
  return chunks.length > 1 ? chunks : null;
}
