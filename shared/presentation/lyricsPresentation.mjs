// Pure presentation projection shared across renderer and Browser Source.
export const MAX_LYRICS_PRESENTATION_BUBBLES = 3;
export const MAX_LIVE_STAGE_CAPTION_LINES = 2;
export const MAX_LIVE_STAGE_CAPTION_PAGES = 2;

const PARENTHETICAL_RE = /\([^()（）]+\)|（[^()（）]+）/gu;
const PARENTHESIS_MARK_RE = /[()（）]/u;
const SPEAKER_RE = /^\[([^\]\r\n]{1,40})\](?:[ \t]*\r?\n|[ \t]+|$)/u;
const SEMANTIC_PUNCTUATION_RE = /[,，、。！？!?;；:：]/u;
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const CJK_GLYPH_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const HANGUL_RE = /[\uac00-\ud7af]/u;
const KANA_RE = /[\u3040-\u30ff]/u;
const HAN_RE = /[\u3400-\u9fff]/u;
const FILLER_WORDS = new Set(['ah', 'eh', 'hm', 'hmm', 'oh', 'ooh', 'uh']);
const LIVE_STAGE_ROW_WIDTHS = [7, 11, 7, 11];
const LIVE_STAGE_MAX_ROW_WIDTH = Math.max(...LIVE_STAGE_ROW_WIDTHS);
const KOREAN_GENITIVE_PRONOUNS = new Set([
  '나의',
  '너의',
  '저의',
  '우리의',
  '그의',
  '너만의',
  '우리만의',
]);
const KOREAN_PHRASE_END_WORDS = new Set([
  '대로',
  '만큼',
  '처럼',
  '뿐',
  '밖에',
  '조차',
  '마저',
]);

function lexicalTokens(value) {
  return [...String(value ?? '').matchAll(WORD_RE)].map((match) => ({
    end: match.index + match[0].length,
    normalized: match[0].toLocaleLowerCase(),
    start: match.index,
    text: match[0],
  }));
}

function repeatKey(value) {
  return lexicalTokens(value)
    .map((token) => token.normalized)
    .join(' ');
}

function fillerCandidate(value) {
  const tokens = lexicalTokens(value);
  return (
    tokens.length > 0 &&
    tokens.every((token) => FILLER_WORDS.has(token.normalized))
  );
}

function trimmedRange(sourceText, start, end) {
  let sourceStart = start;
  let sourceEnd = end;
  while (sourceStart < sourceEnd && /\s/u.test(sourceText[sourceStart])) {
    sourceStart += 1;
  }
  while (sourceEnd > sourceStart && /\s/u.test(sourceText[sourceEnd - 1])) {
    sourceEnd -= 1;
  }
  return { sourceEnd, sourceStart };
}

function semanticUnit(sourceText, kind, start, end, breakBefore = null) {
  const range = trimmedRange(sourceText, start, end);
  const rawText = sourceText.slice(range.sourceStart, range.sourceEnd);
  const isParenthetical = kind === 'parenthetical';
  const contentStart = isParenthetical
    ? range.sourceStart + 1
    : range.sourceStart;
  const contentEnd = isParenthetical ? range.sourceEnd - 1 : range.sourceEnd;
  const contentRange = trimmedRange(sourceText, contentStart, contentEnd);
  const text = sourceText
    .slice(contentRange.sourceStart, contentRange.sourceEnd)
    .replace(/[ \t]+/gu, ' ')
    .trim();
  return {
    kind,
    text,
    sourceText: rawText,
    sourceStart: range.sourceStart,
    sourceEnd: range.sourceEnd,
    contentStart: contentRange.sourceStart,
    contentEnd: contentRange.sourceEnd,
    breakBefore,
    fillerCandidate: fillerCandidate(text),
    repeatKey: repeatKey(text),
  };
}

function splitMainRange(sourceText, start, end, initialBreak = null) {
  const units = [];
  let unitStart = null;
  let breakBefore = initialBreak;

  const pushUnit = (unitEnd) => {
    if (unitStart === null) return;
    const unit = semanticUnit(
      sourceText,
      'main',
      unitStart,
      unitEnd,
      breakBefore,
    );
    if (unit.text) units.push(unit);
    unitStart = null;
  };

  for (let index = start; index < end; index += 1) {
    const character = sourceText[index];
    if (character === '\r' || character === '\n') {
      pushUnit(index);
      if (character === '\r' && sourceText[index + 1] === '\n') index += 1;
      breakBefore = 'authored';
      continue;
    }
    if (unitStart === null && !/\s/u.test(character)) unitStart = index;
    if (unitStart !== null && SEMANTIC_PUNCTUATION_RE.test(character)) {
      pushUnit(index + 1);
      breakBefore = 'punctuation';
    }
  }
  pushUnit(end);
  return units;
}

export function analyzeLyricsSource(value) {
  const sourceText = String(value ?? '').trim();
  const speakerMatch = sourceText.match(SPEAKER_RE);
  const speaker = speakerMatch?.[1]?.trim() ?? '';
  const contentStart = speakerMatch?.[0]?.length ?? 0;
  const contentText = sourceText.slice(contentStart);
  const parentheticals = [...contentText.matchAll(PARENTHETICAL_RE)];
  const residualText = contentText.replace(PARENTHETICAL_RE, ' ');
  const malformedParenthetical = PARENTHESIS_MARK_RE.test(residualText);

  if (!sourceText) {
    return {
      sourceText,
      speaker,
      units: [],
      malformedParenthetical: false,
    };
  }

  if (malformedParenthetical) {
    return {
      sourceText,
      speaker,
      units: [
        semanticUnit(sourceText, 'main', contentStart, sourceText.length),
      ],
      malformedParenthetical: true,
    };
  }

  const units = [];
  let cursor = contentStart;
  let nextBreak = speakerMatch?.[0]?.includes('\n') ? 'authored' : null;
  for (const match of parentheticals) {
    const start = contentStart + match.index;
    units.push(...splitMainRange(sourceText, cursor, start, nextBreak));
    units.push(
      semanticUnit(
        sourceText,
        'parenthetical',
        start,
        start + match[0].length,
        'parenthetical',
      ),
    );
    cursor = start + match[0].length;
    nextBreak = 'parenthetical';
  }
  units.push(
    ...splitMainRange(sourceText, cursor, sourceText.length, nextBreak),
  );

  return {
    sourceText,
    speaker,
    units,
    malformedParenthetical: false,
  };
}

function lineSpacingMode(text, language) {
  const normalizedLanguage = String(language ?? '').toLocaleLowerCase();
  if (normalizedLanguage.startsWith('ko')) return 'word';
  if (normalizedLanguage.startsWith('ja')) return 'phrase';
  if (normalizedLanguage.startsWith('zh')) return 'phrase';
  if (normalizedLanguage.startsWith('en')) return 'word';
  if (HANGUL_RE.test(text)) return 'word';
  if (KANA_RE.test(text) || HAN_RE.test(text)) return 'phrase';
  return 'word';
}

function compactBubbles(bubbles, limit) {
  if (bubbles.length <= limit) return bubbles;
  if (limit <= 1) {
    return [
      {
        kind: bubbles[0].kind,
        text: bubbles.map((bubble) => bubble.text).join(' '),
      },
    ];
  }
  return [
    ...bubbles.slice(0, limit - 1),
    {
      kind: bubbles[limit - 1].kind,
      text: bubbles
        .slice(limit - 1)
        .map((bubble) => bubble.text)
        .join(' '),
    },
  ];
}

function boundBubbles(mainBubbles, asideBubbles) {
  let asideSlots = Math.min(
    asideBubbles.length,
    MAX_LYRICS_PRESENTATION_BUBBLES,
  );
  if (mainBubbles.length > 0) {
    asideSlots = Math.min(asideSlots, MAX_LYRICS_PRESENTATION_BUBBLES - 1);
  }
  const mainSlots = Math.min(
    mainBubbles.length,
    MAX_LYRICS_PRESENTATION_BUBBLES - asideSlots,
  );
  return [
    ...compactBubbles(mainBubbles, mainSlots),
    ...compactBubbles(asideBubbles, asideSlots),
  ];
}

function untouchedManga(sourceText) {
  return {
    transformed: false,
    bubbles: [{ kind: 'main', text: sourceText }],
  };
}

export function adaptMangaLyricsPresentation(analysis, options = {}) {
  const sourceText = String(analysis?.sourceText ?? '');
  if (!sourceText) return untouchedManga('');
  if (analysis?.malformedParenthetical) return untouchedManga(sourceText);

  const parentheticalUnits = (analysis?.units ?? []).filter(
    (unit) => unit.kind === 'parenthetical',
  );
  const maskedMain = sourceText.split('');
  for (const unit of parentheticalUnits) {
    for (let index = unit.sourceStart; index < unit.sourceEnd; index += 1) {
      maskedMain[index] = ' ';
    }
  }
  const normalizedMain = maskedMain.join('').replace(/\s+/gu, ' ').trim();
  const phraseSpacing = lineSpacingMode(
    normalizedMain || sourceText,
    options.language,
  );
  const mainChunks = normalizedMain
    ? phraseSpacing === 'phrase'
      ? normalizedMain.split(/\s+/u)
      : [normalizedMain]
    : [];
  const mainBubbles = mainChunks.map((text) => ({ kind: 'main', text }));
  const asideBubbles = parentheticalUnits.map((unit) => ({
    kind: 'aside',
    text: unit.text,
  }));
  const bubbles = boundBubbles(mainBubbles, asideBubbles);
  const transformed =
    asideBubbles.length > 0 ||
    mainBubbles.length > 1 ||
    bubbles.some((bubble) => bubble.kind !== 'main');

  return transformed
    ? { transformed: true, bubbles }
    : untouchedManga(sourceText);
}

function stripBoundaryFillers(value) {
  let text = String(value ?? '').trim();
  let tokens = lexicalTokens(text);
  if (tokens.length === 0) return text;
  if (tokens.every((token) => FILLER_WORDS.has(token.normalized))) return '';

  const first = tokens[0];
  const second = tokens[1];
  if (
    FILLER_WORDS.has(first.normalized) &&
    second &&
    /[,，、:：;；!?！？]/u.test(text.slice(first.end, second.start))
  ) {
    text = text.slice(second.start).trim();
    tokens = lexicalTokens(text);
  }

  const last = tokens.at(-1);
  const previous = tokens.at(-2);
  if (
    last &&
    previous &&
    FILLER_WORDS.has(last.normalized) &&
    /[,，、:：;；!?！？]/u.test(text.slice(previous.end, last.start))
  ) {
    text = text
      .slice(0, previous.end)
      .replace(/[,，、:：;；!?！？\s]+$/gu, '')
      .trim();
  }
  return text;
}

function collapseRepeatedPhrase(value) {
  const text = String(value ?? '').trim();
  const tokens = lexicalTokens(text);
  for (
    let patternLength = 1;
    patternLength <= tokens.length / 2;
    patternLength += 1
  ) {
    if (tokens.length % patternLength !== 0) continue;
    const repeats = tokens.every(
      (token, index) =>
        token.normalized === tokens[index % patternLength].normalized,
    );
    if (repeats) return text.slice(0, tokens[patternLength - 1].end).trim();
  }
  return text;
}

function visualWidth(value) {
  return Array.from(String(value ?? '')).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.35;
    if (CJK_GLYPH_RE.test(character)) return total + 1;
    if (/[,，、。！？!?;；:：()（）'’]/u.test(character)) return total + 0.35;
    return total + 0.55;
  }, 0);
}

function wordScript(value) {
  const hasCjk = CJK_GLYPH_RE.test(value);
  const hasLatin = /\p{Script=Latin}/u.test(value);
  if (hasCjk && hasLatin) return 'mixed';
  if (hasCjk) return 'cjk';
  if (hasLatin) return 'latin';
  return 'other';
}

function normalizedWord(value) {
  return lexicalTokens(value)
    .map((token) => token.normalized)
    .join('');
}

function isKoreanPhraseBoundary(words, end) {
  return KOREAN_PHRASE_END_WORDS.has(normalizedWord(words[end - 1]));
}

function isLikelyKoreanGenitiveBoundary(words, end) {
  return KOREAN_GENITIVE_PRONOUNS.has(normalizedWord(words[end - 1]));
}

function isSubstantialScriptBoundary(words, end) {
  if (end <= 0 || end >= words.length) return false;
  const leftScript = wordScript(words[end - 1]);
  const rightScript = wordScript(words[end]);
  if (
    leftScript === rightScript ||
    leftScript === 'other' ||
    rightScript === 'other'
  ) {
    return false;
  }

  let leftStart = end - 1;
  while (leftStart > 0 && wordScript(words[leftStart - 1]) === leftScript) {
    leftStart -= 1;
  }
  let rightEnd = end + 1;
  while (
    rightEnd < words.length &&
    wordScript(words[rightEnd]) === rightScript
  ) {
    rightEnd += 1;
  }
  return (
    visualWidth(words.slice(leftStart, end).join(' ')) >= 3 &&
    visualWidth(words.slice(end, rightEnd).join(' ')) >= 3
  );
}

function compareBreakPriority(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function splitCaptionRows(text, rowCount, startRowIndex = 0) {
  if (rowCount <= 1) return text ? [text] : [];
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length > 1) {
    const rows = [];
    let wordIndex = 0;
    for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex += 1) {
      const remainingRows = rowCount - rowIndex;
      const remainingWords = words.slice(wordIndex);
      const target = Math.min(
        LIVE_STAGE_MAX_ROW_WIDTH,
        visualWidth(remainingWords.join(' ')) / remainingRows,
      );
      const futureCapacity = Array.from(
        { length: remainingRows - 1 },
        (_, index) =>
          LIVE_STAGE_ROW_WIDTHS[
            (startRowIndex + rowIndex + index + 1) %
              LIVE_STAGE_ROW_WIDTHS.length
          ],
      ).reduce((total, width) => total + width, 0);
      const lastCandidate = words.length - (remainingRows - 1);
      let bestEnd = wordIndex + 1;
      let bestPriority = null;
      for (let end = wordIndex + 1; end <= lastCandidate; end += 1) {
        const candidate = words.slice(wordIndex, end).join(' ');
        const candidateWidth = visualWidth(candidate);
        const remainder = words.slice(end).join(' ');
        const remainderWidth = visualWidth(remainder);
        const overflow = Math.max(0, candidateWidth - LIVE_STAGE_MAX_ROW_WIDTH);
        const remainderOverflow = Math.max(0, remainderWidth - futureCapacity);
        const reversedTwoRowHierarchy =
          remainingRows === 2
            ? Math.max(0, candidateWidth - remainderWidth)
            : 0;
        const strongBoundary =
          isKoreanPhraseBoundary(words, end) ||
          isSubstantialScriptBoundary(words, end);
        const priority = [
          overflow + remainderOverflow,
          reversedTwoRowHierarchy,
          isLikelyKoreanGenitiveBoundary(words, end) ? 1 : 0,
          strongBoundary ? 0 : 1,
          Math.abs(candidateWidth - target),
        ];
        if (
          bestPriority === null ||
          compareBreakPriority(priority, bestPriority) < 0
        ) {
          bestPriority = priority;
          bestEnd = end;
        }
      }
      rows.push(words.slice(wordIndex, bestEnd).join(' '));
      wordIndex = bestEnd;
    }
    rows.push(words.slice(wordIndex).join(' '));
    return rows.filter(Boolean);
  }

  const glyphs = Array.from(text);
  const rows = [];
  let offset = 0;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const remaining = glyphs.length - offset;
    const take = Math.ceil(remaining / (rowCount - rowIndex));
    rows.push(glyphs.slice(offset, offset + take).join(''));
    offset += take;
  }
  return rows.filter(Boolean);
}

function captionRowCount(text, startRowIndex, preferKoreanPair = false) {
  const width = visualWidth(text);
  const words = text.split(/\s+/u).filter(Boolean);
  if (
    preferKoreanPair &&
    HANGUL_RE.test(text) &&
    words.length >= 3 &&
    width <= LIVE_STAGE_MAX_ROW_WIDTH
  ) {
    return 2;
  }
  let capacity = 0;
  for (let index = 0; index < LIVE_STAGE_ROW_WIDTHS.length; index += 1) {
    capacity +=
      LIVE_STAGE_ROW_WIDTHS[
        (startRowIndex + index) % LIVE_STAGE_ROW_WIDTHS.length
      ];
    if (width <= capacity) return index + 1;
  }
  return LIVE_STAGE_ROW_WIDTHS.length;
}

function stripLiveStageDisplayPunctuation(value) {
  const text = String(value ?? '');
  const visible = text.replace(
    /[，、。！？；：．…,.!?;:]+/gu,
    (punctuation, offset, source) => {
      let previousIndex = offset - 1;
      while (previousIndex >= 0 && /\s/u.test(source[previousIndex])) {
        previousIndex -= 1;
      }
      let nextIndex = offset + punctuation.length;
      while (nextIndex < source.length && /\s/u.test(source[nextIndex])) {
        nextIndex += 1;
      }
      const previous = source[previousIndex] ?? '';
      const next = source[nextIndex] ?? '';
      const hasCjkPunctuation = /[，、。！？；：．…]/u.test(punctuation);
      return hasCjkPunctuation ||
        CJK_GLYPH_RE.test(previous) ||
        CJK_GLYPH_RE.test(next)
        ? ''
        : punctuation;
    },
  );
  return visible.replace(/\s{2,}/gu, ' ').trim();
}

function liveStageDisplayEntries(analysis) {
  const entries = [];
  let previousKey = '';
  let previousMainKey = '';
  let capitalizeNext = false;

  for (const unit of analysis?.units ?? []) {
    let text = stripBoundaryFillers(unit.text);
    text = collapseRepeatedPhrase(text);
    if (unit.kind === 'main') text = stripLiveStageDisplayPunctuation(text);
    const key = repeatKey(text);
    if (!text || !key || unit.fillerCandidate) {
      if (unit.fillerCandidate) capitalizeNext = true;
      continue;
    }
    if (key === previousKey) continue;
    if (unit.kind === 'parenthetical' && key === previousMainKey) continue;
    if (capitalizeNext && unit.kind === 'main') {
      text = text.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase());
    }

    entries.push({
      kind: unit.kind,
      text: unit.kind === 'parenthetical' ? `(${text})` : text,
      authored: unit.breakBefore === 'authored',
    });
    previousKey = key;
    if (unit.kind === 'main') previousMainKey = key;
    capitalizeNext = false;
  }
  const finalEntry = entries.at(-1);
  if (finalEntry?.kind === 'main') {
    finalEntry.text = finalEntry.text.replace(/[,，]\s*$/u, '').trim();
  }
  return entries;
}

function splitLiveStageContractedLead(text) {
  const match = text.match(/^(I['’]m)\s+(.+)$/iu);
  if (!match) return [];
  const continuation = match[2].replace(/[,，]\s*$/u, '').trim();
  return continuation ? [match[1], continuation] : [];
}

function captionRows(entries) {
  const rows = [];
  const preferKoreanPair = entries.length === 1;
  for (const entry of entries) {
    if (entry.kind === 'main') {
      const editorialRows = splitLiveStageContractedLead(entry.text);
      if (editorialRows.length > 0) {
        rows.push(...editorialRows);
        continue;
      }
    }
    if (entry.kind === 'parenthetical' || entry.authored) {
      rows.push(entry.text);
      continue;
    }
    const rowCount = captionRowCount(entry.text, rows.length, preferKoreanPair);
    rows.push(...splitCaptionRows(entry.text, rowCount, rows.length));
  }
  return rows;
}

function compactRows(rows, limit) {
  if (rows.length <= limit) return rows;
  return [...rows.slice(0, limit - 1), rows.slice(limit - 1).join(' ')];
}

function captionPages(rows) {
  const pageCapacity = MAX_LIVE_STAGE_CAPTION_LINES;
  const boundedRows = compactRows(
    rows,
    pageCapacity * MAX_LIVE_STAGE_CAPTION_PAGES,
  );
  const pages = [];
  for (let index = 0; index < boundedRows.length; index += pageCapacity) {
    const lines = boundedRows.slice(index, index + pageCapacity);
    pages.push({
      lines,
      weight: Math.max(
        1,
        lines.reduce((total, line) => total + visualWidth(line), 0),
      ),
    });
  }
  return pages;
}

function pageBreakProgresses(pages) {
  const totalWeight = pages.reduce((total, page) => total + page.weight, 0);
  if (pages.length <= 1 || totalWeight <= 0) return [];
  let elapsedWeight = 0;
  return pages.slice(0, -1).map((page) => {
    elapsedWeight += page.weight;
    return elapsedWeight / totalWeight;
  });
}

export function adaptLiveStageLyricsPresentation(analysis, options = {}) {
  const sourceText = String(analysis?.sourceText ?? '');
  const entries = liveStageDisplayEntries(analysis);
  const rows = captionRows(entries);
  const pages = captionPages(rows);
  const breaks = pageBreakProgresses(pages);
  const lineProgress = Number.isFinite(options.lineProgress)
    ? Math.min(1, Math.max(0, options.lineProgress))
    : null;
  const pageIndex =
    lineProgress === null
      ? 0
      : Math.min(
          pages.length - 1,
          breaks.filter((boundary) => lineProgress >= boundary).length,
        );
  const lines =
    lineProgress === null && pages.length > 1
      ? compactRows(rows, MAX_LIVE_STAGE_CAPTION_LINES)
      : (pages[pageIndex]?.lines ?? []);
  return {
    sourceText,
    speaker: analysis?.speaker ?? '',
    lines,
    pages,
    pageIndex: Math.max(0, pageIndex),
    pageBreakProgresses: breaks,
    metadataOnly: Boolean(analysis?.speaker && rows.length === 0),
    transformed: Boolean(
      analysis?.speaker || lines.join('\n') !== sourceText || pages.length > 1,
    ),
  };
}
