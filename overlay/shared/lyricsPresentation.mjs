export const MAX_LYRICS_PRESENTATION_BUBBLES = 3;
export const MAX_LIVE_STAGE_CAPTION_LINES = 2;

const PARENTHETICAL_RE = /\([^()（）]+\)|（[^()（）]+）/gu;
const PARENTHESIS_MARK_RE = /[()（）]/u;
const LIVE_STAGE_SPEAKER_RE = /^\[([^\]\r\n]{1,40})\](?:[ \t]*\r?\n|[ \t]+|$)/u;
const LIVE_STAGE_BALANCE_THRESHOLD = 34;
const HANGUL_RE = /[\uac00-\ud7af]/u;
const KANA_RE = /[\u3040-\u30ff]/u;
const HAN_RE = /[\u3400-\u9fff]/u;

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

function untouched(text) {
  return {
    transformed: false,
    bubbles: [{ kind: 'main', text }],
  };
}

function balancedCaptionRows(text) {
  const authoredRows = text
    .split(/\r?\n/u)
    .map((row) => row.replace(/[ \t]+/gu, ' ').trim())
    .filter(Boolean);
  if (authoredRows.length > 1) {
    return [authoredRows[0], authoredRows.slice(1).join(' ')].filter(Boolean);
  }

  const row = authoredRows[0] ?? '';
  const glyphs = Array.from(row);
  if (glyphs.length <= LIVE_STAGE_BALANCE_THRESHOLD) {
    return row ? [row] : [];
  }

  const words = row.split(' ').filter(Boolean);
  if (words.length > 1) {
    let bestIndex = 1;
    let smallestDelta = Infinity;
    for (let index = 1; index < words.length; index += 1) {
      const first = words.slice(0, index).join(' ');
      const second = words.slice(index).join(' ');
      const delta = Math.abs(
        Array.from(first).length - Array.from(second).length,
      );
      if (delta < smallestDelta) {
        bestIndex = index;
        smallestDelta = delta;
      }
    }
    return [
      words.slice(0, bestIndex).join(' '),
      words.slice(bestIndex).join(' '),
    ];
  }

  const midpoint = Math.ceil(glyphs.length / 2);
  return [glyphs.slice(0, midpoint).join(''), glyphs.slice(midpoint).join('')];
}

export function preprocessLiveStageCaption(text) {
  const sourceText = String(text ?? '').trim();
  const speakerMatch = sourceText.match(LIVE_STAGE_SPEAKER_RE);
  const speaker = speakerMatch?.[1]?.trim() ?? '';
  const captionText = speakerMatch
    ? sourceText.slice(speakerMatch[0].length).trim()
    : sourceText;
  const lines = balancedCaptionRows(captionText).slice(
    0,
    MAX_LIVE_STAGE_CAPTION_LINES,
  );

  return {
    sourceText,
    speaker,
    lines,
    metadataOnly: Boolean(speaker && lines.length === 0),
    transformed: Boolean(speaker || lines.join('\n') !== sourceText),
  };
}

export function preprocessLyricsPresentation(text, options = {}) {
  const sourceText = String(text ?? '').trim();
  if (!sourceText) return untouched('');

  const parentheticals = [...sourceText.matchAll(PARENTHETICAL_RE)];
  const mainText = sourceText.replace(PARENTHETICAL_RE, ' ').trim();
  if (PARENTHESIS_MARK_RE.test(mainText)) return untouched(sourceText);

  const normalizedMain = mainText.replace(/\s+/gu, ' ').trim();
  const phraseSpacing = lineSpacingMode(
    normalizedMain || sourceText,
    options.language,
  );
  const mainChunks = normalizedMain
    ? phraseSpacing === 'phrase'
      ? normalizedMain.split(/\s+/u)
      : [normalizedMain]
    : [];
  const mainBubbles = mainChunks.map((value) => ({
    kind: 'main',
    text: value,
  }));
  const asideBubbles = parentheticals.map((match) => ({
    kind: 'aside',
    text: match[0].slice(1, -1).trim(),
  }));
  const bubbles = boundBubbles(mainBubbles, asideBubbles);
  const transformed =
    asideBubbles.length > 0 ||
    mainBubbles.length > 1 ||
    bubbles.some((bubble) => bubble.kind !== 'main');

  return transformed ? { transformed: true, bubbles } : untouched(sourceText);
}
