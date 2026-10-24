// Lossless annotations. Explicit bylines default to Output-hidden; ambiguous
// credit-like prose remains a candidate. The source document is never filtered.
export const LYRICS_TEXT_PROCESSING_VERSION = 4;
const CREDIT_ROLE = [
  '作詞',
  '作词',
  '作曲',
  '編曲',
  '编曲',
  '詞曲',
  '词曲',
  '製作人',
  '制作人',
  '製作',
  '制作',
  '(?:錄音|录音|混音)(?:工程[師师]|[師师]|助理)?',
  '母[帶带](?:工程[師师]|[師师]|後期|后期)?',
  '人[聲声](?:製作|制作)(?:[ \\t]*(?:和|與|与|及)[ \\t]*(?:錄音|录音))?',
  '吉他|貝斯|贝斯|鼓|鍵盤|键盘|鋼琴|钢琴|弦樂|弦乐',
  'lyrics?(?:[ \\t]+by)?',
  'music[ \\t]+by',
  'composed[ \\t]+by',
  'written[ \\t]+by',
  'arranged[ \\t]+by',
  '(?:executive[ \\t]+|co[- ]?)?producers?',
  'produced[ \\t]+by',
  'arrang(?:er|ement)',
  'mix(?:ing|ed[ \\t]+by)?(?:[ \\t]+(?:engineers?|assistants?))?',
  'master(?:ing|ed[ \\t]+by)?(?:[ \\t]+engineers?)?',
  'record(?:ing|ed[ \\t]+by)(?:[ \\t]+(?:engineers?|assistants?))?',
  'vocal[ \\t]+production',
  'guitars?|bass|drums?|keyboards?|piano|strings',
  'backing[ \\t]+vocals?',
  'プロデュース',
  'プロデューサー',
  '録音',
  'ミックス',
  'マスタリング',
  'ギター|ベース|ドラム|ピアノ|キーボード',
  '작사',
  '작곡',
  '편곡',
  '프로듀서',
  '프로듀싱',
  '믹싱(?:[ \\t]+(?:엔지니어|어시스턴트))?',
  '마스터링',
  '녹음',
  '기타|베이스|드럼|피아노|키보드',
].join('|');
const CREDIT_PREFIX = new RegExp(
  `^(?:${CREDIT_ROLE})(?:(?:[ \\t]*[/／&＆、+＋][ \\t]*|[ \\t]+)(?:${CREDIT_ROLE}))*[ \\t]*[:：][ \\t]*(\\S[^\\r\\n\\u2028\\u2029]*)$`,
  'iu',
);

function creditByline(text) {
  if (text.length > 2000) return null;
  return CREDIT_PREFIX.exec(text.trim());
}

function bylineNames(value, header) {
  // Deliberately narrow name/handle shapes, not a semantic classifier. Sentences,
  // additional colons, vocal text and multi-line merged blocks remain visible.
  if (
    /[我你妳他她它唱歌詞歌词啊喔哦啦]|(?:^|\s)(?:I|we|you|sing|oh|ah)(?:\s|$)/iu.test(
      value,
    )
  )
    return false;
  const productionRole =
    /製作|制作|producer|produced|mix|master|record|プロデュー|프로듀|錄音|录音|混音|母帶|母带|録音|ミックス|マスタリング|믹싱|마스터링|녹음/iu.test(
      header,
    );
  return value.split(/[/／&＆、,，+＋]/u).every((name) => {
    // One optional, bounded studio affiliation is still a byline, not lyric prose.
    const parts = name.split(/[@＠]/u);
    if (parts.length > 2) return false;
    if (
      parts.length === 2 &&
      !/^[\p{L}\p{N}][\p{L}\p{N} .'’_-]{0,79}$/u.test(parts[1].trim())
    )
      return false;
    const token = parts[0].trim();
    return (
      /^(?:[A-Z][A-Za-z0-9'’._-]*)(?:[ \t]+[A-Z][A-Za-z0-9'’._-]*){0,4}$/u.test(
        token,
      ) ||
      (productionRole &&
        (/^[\p{Script=Han}·・]{2,8}$/u.test(token) ||
          /^[\p{Script=Katakana}ー・]{2,20}$/u.test(token) ||
          /^[\p{Script=Hangul}]{2,8}$/u.test(token)))
    );
  });
}
const PAIRS = new Map([
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['【', '】'],
  ['{', '}'],
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
  ['《', '》'],
  ['〈', '〉'],
]);
const CLOSINGS = new Set(PAIRS.values());
const OPENING_RE = /[(（[【{「『“‘《〈]$/u;
const CLOSING_RE = /^[)）\]】}」』”’》〉,，、。！？!?;；:：.…‥]/u;
const PERFORMANCE_LABEL =
  /^(?:和[聲声]|合[聲声]|合唱|伴唱|backing[ \t]+vocals?|ハモリ|コーラス|코러스|화음)$/iu;
const VOCAL_ROLES = new Map([
  ...['男', '男聲', '男声', 'male', 'man', 'm', '♂', '男性', '남', '남자'].map(
    (label) => [label, 'male'],
  ),
  ...[
    '女',
    '女聲',
    '女声',
    'female',
    'woman',
    'f',
    '♀',
    '女性',
    '여',
    '여자',
  ].map((label) => [label, 'female']),
  ...[
    '合',
    '合唱',
    '男女',
    '男女合唱',
    '全體',
    '全体',
    '全員',
    'duet',
    'both',
    'all',
    'together',
    'group',
    '합창',
  ].map((label) => [label, 'group']),
]);
export function lyricsVocalRole(label) {
  return VOCAL_ROLES.get(String(label).trim().toLocaleLowerCase()) ?? null;
}

function vocalMarkers(text, pairedRanges, malformed, options) {
  if (malformed || text.length > 2000) return [];
  const names = new Set(
    (options.performers ?? [])
      .slice(0, 100)
      .flatMap((name) =>
        typeof name === 'string'
          ? [name, ...name.split(/[、,，/&＆;；]|\s+(?:feat\.?|ft\.?)\s+/iu)]
          : [],
      )
      .map((name) => name.trim().normalize('NFC').toLocaleLowerCase())
      .filter(Boolean),
  );
  const inPair = (from, to) =>
    pairedRanges.some((r) => r.sourceStart < from && r.sourceEnd >= to);
  const candidateName = (label) =>
    /^(?:[A-Z][A-Za-z0-9'’._-]{0,23})(?:[ \t]+[A-Z][A-Za-z0-9'’._-]{0,23}){0,3}$|^[\p{Script=Han}·・]{2,8}$|^[\p{Script=Katakana}ー・]{2,20}$|^[\p{Script=Hangul}]{2,8}$/u.test(
      label,
    );
  const markers = [];
  const add = (label, from, to, atStart) => {
    label = label.trim();
    if (!label || label.length > 40 || inPair(from, to)) return;
    const role = lyricsVocalRole(label);
    const known = names.has(label.normalize('NFC').toLocaleLowerCase());
    if (
      !role &&
      (!atStart ||
        PERFORMANCE_LABEL.test(label) ||
        (!known && !candidateName(label)))
    )
      return;
    markers.push({
      sourceStart: from,
      sourceEnd: to,
      label,
      role: role ?? 'solo',
      confirmed: Boolean(role || known),
    });
  };
  for (const range of pairedRanges) {
    const { sourceStart: from, sourceEnd: to } = range;
    if (!/[(（[【]/u.test(text[from])) continue;
    const label = text.slice(from + 1, to - 1).trim();
    if (
      /[(（]/u.test(text[from]) &&
      !lyricsVocalRole(label) &&
      !names.has(label.normalize('NFC').toLocaleLowerCase())
    )
      continue;
    const before = text
      .slice(0, from)
      .split(/[\r\n\u2028\u2029]/u)
      .at(-1);
    add(
      text.slice(from + 1, to - 1),
      from,
      to + (text.slice(to).match(/^[ \t]*(?:[:：][ \t]*)?/u)?.[0].length ?? 0),
      !before.trim(),
    );
  }
  for (const match of text.matchAll(
    /^([ \t]*)([^:\r\n\u2028\u2029]{1,40})[:：][ \t]*/gmu,
  )) {
    if (creditByline(`${match[2]}: X`)) continue;
    add(
      match[2],
      match.index + match[1].length,
      match.index + match[0].length,
      true,
    );
  }
  for (const match of text.matchAll(
    /([ \t]+)([\p{L}♂♀]{1,12})[ \t]*[:：][ \t]*/gu,
  ))
    if (lyricsVocalRole(match[2]))
      add(
        match[2],
        match.index + match[1].length,
        match.index + match[0].length,
        false,
      );
  return markers
    .sort((a, b) => a.sourceStart - b.sourceStart)
    .filter((m, i, all) => !i || m.sourceStart >= all[i - 1].sourceEnd);
}

export function sliceLyricsVocalParts(parts, from, to) {
  return (parts ?? []).flatMap((part) => {
    const left = Math.max(part.from, from),
      right = Math.min(part.to, to);
    return left < right
      ? [{ ...part, from: left - from, to: right - from }]
      : [];
  });
}

export function analyzeLyricsText(value, options = {}) {
  const sourceText = String(value ?? '');
  const credit = creditByline(sourceText);
  const pairedRanges = [];
  const stack = [];
  let malformedPairs = false;
  // Canonical limits are enforced by the owner. Unsupported raw input is kept.
  if (sourceText.length <= 2000) {
    for (let index = 0; index < sourceText.length; index++) {
      const ch = sourceText[index];
      if (ch === '"') {
        let escapes = 0;
        for (let at = index - 1; at >= 0 && sourceText[at] === '\\'; at--)
          escapes++;
        if (escapes % 2) continue;
        if (stack.at(-1)?.close === ch) {
          const open = stack.pop();
          pairedRanges.push({ sourceStart: open.start, sourceEnd: index + 1 });
        } else stack.push({ start: index, close: ch });
      } else if (PAIRS.has(ch)) {
        stack.push({ start: index, close: PAIRS.get(ch) });
      } else if (CLOSINGS.has(ch)) {
        // A curly apostrophe in a word is not a quotation delimiter.
        if (
          ch === '’' &&
          /[\p{L}\p{N}]/u.test(sourceText[index - 1] ?? '') &&
          /[\p{L}\p{N}]/u.test(sourceText[index + 1] ?? '')
        )
          continue;
        if (stack.at(-1)?.close !== ch) malformedPairs = true;
        else {
          const open = stack.pop();
          pairedRanges.push({ sourceStart: open.start, sourceEnd: index + 1 });
        }
      }
    }
    malformedPairs ||= stack.length > 0;
  }
  let outputLabelRanges = pairedRanges
    .filter((range) => {
      const { sourceStart: from, sourceEnd: to } = range;
      return (
        !malformedPairs &&
        /[(（[【]/u.test(sourceText[from]) &&
        PERFORMANCE_LABEL.test(sourceText.slice(from + 1, to - 1).trim()) &&
        !pairedRanges.some(
          (outer) => outer.sourceStart < from && outer.sourceEnd > to,
        )
      );
    })
    .sort((a, b) => a.sourceStart - b.sourceStart);
  const markers = credit
    ? []
    : vocalMarkers(sourceText, pairedRanges, malformedPairs, options);
  const hasDefinite =
    outputLabelRanges.length || markers.some((m) => m.confirmed);
  const eligible = markers.filter((m) => m.confirmed || !hasDefinite);
  for (const marker of eligible) {
    outputLabelRanges = outputLabelRanges.filter(
      (r) =>
        r.sourceStart !== marker.sourceStart ||
        r.sourceEnd !== marker.sourceEnd,
    );
    outputLabelRanges.push({
      sourceStart: marker.sourceStart,
      sourceEnd: marker.sourceEnd,
      defaultHidden: marker.confirmed,
    });
  }
  outputLabelRanges.sort((a, b) => a.sourceStart - b.sourceStart);
  return {
    sourceText,
    sourceStart: 0,
    sourceEnd: sourceText.length,
    kind: credit ? 'credit-candidate' : 'lyric',
    defaultHidden: Boolean(
      outputLabelRanges.some((r) => r.defaultHidden !== false) ||
      (credit &&
        bylineNames(
          credit[1],
          sourceText.slice(0, sourceText.search(/[:：]/u)),
        )),
    ),
    outputLabelRanges,
    vocalMarkers: eligible,
    pairedRanges,
    malformedPairs,
  };
}

export function isProtectedLyricsBreak(analysis, offset) {
  return analysis.pairedRanges.some(
    (r) => offset > r.sourceStart && offset < r.sourceEnd,
  );
}

export function isSafeLyricsBreak(text, offset) {
  if (offset <= 0 || offset >= text.length) return true;
  const before = text.slice(0, offset).trimEnd();
  const after = text.slice(offset).trimStart();
  if (before.endsWith('"') || after.startsWith('"')) {
    const { pairedRanges } = analyzeLyricsText(text);
    if (
      before.endsWith('"') &&
      !pairedRanges.some((range) => range.sourceEnd === before.length)
    )
      return false;
    if (
      after.startsWith('"') &&
      !pairedRanges.some(
        (range) => range.sourceStart === text.length - after.length,
      )
    )
      return false;
  }
  return !OPENING_RE.test(before) && !CLOSING_RE.test(after);
}

export function preprocessLyricsDocument(document, options = {}) {
  const lines = (document?.lines ?? []).map((line, sourceLineIndex) => ({
    ...analyzeLyricsText(line.text, options),
    lineId: line.lineId,
    sourceLineIndex,
    text: line.text,
  }));
  return {
    version: LYRICS_TEXT_PROCESSING_VERSION,
    lines,
    creditCandidates: lines.filter((line) => line.kind === 'credit-candidate'),
    outputCandidates: lines.filter(
      (line) =>
        line.kind === 'credit-candidate' || line.outputLabelRanges.length,
    ),
  };
}

function selectionHash(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
}

function labelProjection(line, ranges) {
  // Only character coordinates change. Retained segment/fine intervals are
  // copied verbatim; removing a label never interpolates or borrows its time.
  const offsets = new Uint16Array(line.text.length + 1);
  let text = '',
    rangeIndex = 0;
  for (let index = 0; index < line.text.length; index++) {
    while (ranges[rangeIndex]?.sourceEnd <= index) rangeIndex++;
    if (!(ranges[rangeIndex]?.sourceStart <= index)) text += line.text[index];
    offsets[index + 1] = text.length;
  }
  const segments = (values, reading = false) => {
    let cursor = 0;
    return values.flatMap((segment) => {
      const key = 'text' in segment ? 'text' : 't';
      const source = segment[key];
      const from = cursor;
      cursor += source.length;
      const value = text.slice(offsets[from], offsets[cursor]);
      return value
        ? [
            {
              ...segment,
              [key]: value,
              ...(reading && value !== source
                ? { reading: '', ...('r' in segment ? { r: '' } : {}) }
                : {}),
            },
          ]
        : [];
    });
  };
  const projected = { ...line, text };
  if (line.segments) projected.segments = segments(line.segments);
  if (line.estimatedStarts)
    projected.estimatedStarts = {
      ...line.estimatedStarts,
      segments: segments(line.estimatedStarts.segments),
    };
  if (line.estimatedFineTiming) {
    const units = line.estimatedFineTiming.units.flatMap((unit) => {
      const from = offsets[unit.from],
        to = offsets[unit.to];
      return from < to ? [{ ...unit, from, to }] : [];
    });
    if (units.length)
      projected.estimatedFineTiming = { ...line.estimatedFineTiming, units };
    else delete projected.estimatedFineTiming;
  }
  return {
    line: projected,
    offsets,
    reading: (value) => {
      if (value.text !== line.text) return null;
      const result = {
        ...value,
        text,
        segments: segments(value.segments ?? [], true),
      };
      delete result.romaji;
      delete result.romajiScope;
      return result;
    },
  };
}

// Run after Output reading validation, so filtering cannot break the source's
// index-based editing/readings. Canonical documents and timestamps stay intact.
export function projectLyricsTextSelection(
  document,
  hiddenLineIds = [],
  options = {},
) {
  if (
    !document ||
    !Array.isArray(document.lines) ||
    !Array.isArray(hiddenLineIds)
  )
    return document;
  const requested = new Set(hiddenLineIds);
  const hidden = new Set(),
    edited = new Map();
  let carried = null;
  for (const line of document.lines) {
    const selected = requested.has(line.lineId);
    const analysis = analyzeLyricsText(line.text, options);
    if (selected && analysis.kind === 'credit-candidate') {
      hidden.add(line.lineId);
      continue;
    }
    let projection = null;
    if (selected && analysis.outputLabelRanges.length) {
      projection = labelProjection(line, analysis.outputLabelRanges);
      if (!projection.line.text.trim()) hidden.add(line.lineId);
      else edited.set(line.lineId, projection);
    }
    const markers = analysis.vocalMarkers.filter(
      (m) => m.confirmed || selected,
    );
    // Explicit empty metadata tells legacy template adapters to keep literal or
    // unconfirmed bracket text instead of independently guessing a speaker.
    if (
      !markers.length &&
      (analysis.vocalMarkers.length ||
        /^\s*\[[^\]\r\n]{1,40}\]/u.test(line.text)) &&
      !hidden.has(line.lineId)
    ) {
      projection ??= { line: { ...line }, reading: (value) => value };
      projection.line = { ...projection.line, vocalParts: [] };
      edited.set(line.lineId, projection);
    }
    if (markers.length || carried) {
      const parts = [];
      const addPart = (vocal, from, to) => {
        if (!vocal) return;
        from = projection?.offsets?.[from] ?? from;
        to = projection?.offsets?.[to] ?? to;
        if (from < to)
          parts.push({ from, to, label: vocal.label, role: vocal.role });
      };
      addPart(carried, 0, markers[0]?.sourceStart ?? line.text.length);
      for (let index = 0; index < markers.length; index++)
        addPart(
          markers[index],
          markers[index].sourceStart,
          markers[index + 1]?.sourceStart ?? line.text.length,
        );
      carried = markers.at(-1) ?? carried;
      if (parts.length && !hidden.has(line.lineId)) {
        if (projection)
          projection.line = { ...projection.line, vocalParts: parts };
        else
          projection = {
            line: { ...line, vocalParts: parts },
            reading: (value) => value,
          };
        edited.set(line.lineId, projection);
      }
    }
  }
  if (hidden.size + edited.size === 0) return document;
  const identity = JSON.stringify([
    document.documentId,
    [...hidden],
    [...edited].map(([id, value]) => [
      id,
      value.line.text,
      value.line.vocalParts,
    ]),
  ]);
  const lines = [];
  let nextTimedLine = null;
  for (let index = document.lines.length - 1; index >= 0; index--) {
    const sourceLine = document.lines[index];
    const line = edited.get(sourceLine.lineId)?.line ?? sourceLine;
    // Preserve the source's effective end when its next timed line is hidden.
    // Only the derived Output document materializes this existing boundary.
    if (!hidden.has(line.lineId)) {
      lines.push(
        line.endMs == null &&
          Number.isFinite(line.startMs) &&
          nextTimedLine &&
          hidden.has(nextTimedLine.lineId) &&
          nextTimedLine.startMs >= line.startMs
          ? { ...line, endMs: nextTimedLine.startMs, endInferred: true }
          : line,
      );
    }
    if (Number.isFinite(line.startMs)) nextTimedLine = line;
  }
  lines.reverse();
  return {
    ...document,
    documentId: `${document.documentId.slice(0, 110)}~text-v4-${selectionHash(identity)}`,
    lines,
    ...(document.granularity
      ? {
          granularity: lines.some((line) => line.segments?.length)
            ? 'T2'
            : lines.some((line) => Number.isFinite(line.startMs))
              ? 'T1'
              : 'T0',
        }
      : {}),
    ...(document.reading
      ? {
          reading: {
            ...document.reading,
            lines: document.reading.lines.flatMap((line) => {
              if (hidden.has(line.lineId)) return [];
              const projection = edited.get(line.lineId);
              const reading = projection ? projection.reading(line) : line;
              return reading ? [reading] : [];
            }),
          },
        }
      : {}),
  };
}
