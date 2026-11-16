export const translationTextLimit = 1000;
export const translationImportLimit = 256 * 1024;

const bulletPrefix = /^(?:[-*+][^\S\n]+|[•◦▪‣][^\S\n]*)/u;
const boldLine = /^\*\*(.*?)\*\*$/u;

function copiedLine(row) {
  const text = row.trimStart();
  const bulleted = bulletPrefix.test(text);
  const content = text.replace(bulletPrefix, '').trim();
  const bold = boldLine.exec(content);
  return { bulleted, bold: Boolean(bold), text: (bold?.[1] ?? content).trim() };
}

function pairRows(rows, lines) {
  return rows.flatMap((text, index) =>
    text ? [[lines[index].lineId, text]] : [],
  );
}

function sourceText(text) {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function pairCopiedBlocks(rows, lines, hasBullets) {
  const originals = lines.map(({ text }) => sourceText(text));
  const matches = (row, source) => sourceText(row.text) === originals[source];
  const entries = [];
  const skipped = [];
  let index = 0;
  let sourceIndex = 0;

  while (index < rows.length) {
    const start = sourceIndex;
    while (index < rows.length && !rows[index].bulleted) {
      if (!matches(rows[index], sourceIndex)) {
        if (hasBullets) return { error: 'sourceMismatch' };
        break;
      }
      index++;
      sourceIndex++;
    }

    const translations = [];
    while (
      index < rows.length &&
      (hasBullets ? rows[index].bulleted : !matches(rows[index], sourceIndex))
    ) {
      translations.push(rows[index].text);
      index++;
    }
    if (translations.some((text) => text.length > translationTextLimit))
      return { error: 'lineTooLong' };
    if (translations.length === sourceIndex - start) {
      translations.forEach((text, offset) =>
        entries.push([lines[start + offset].lineId, text]),
      );
    } else {
      skipped.push([start + 1, sourceIndex]);
    }
  }

  if (!hasBullets && sourceIndex !== lines.length) return null;
  return { rows: Object.fromEntries(entries), mode: 'blocks', skipped };
}

export function pairTranslationText(text, lines) {
  const rows = text
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');

  while (rows.length && !rows.at(-1).trim()) rows.pop();
  const copied = rows.filter((row) => row.trim()).map(copiedLine);
  const first = copied[0];
  if (!first) return null;

  const startsWithSource =
    lines.length > 0 && sourceText(first.text) === sourceText(lines[0].text);
  const hasBullets = copied.some(({ bulleted }) => bulleted);
  if (hasBullets && !first.bulleted && (first.bold || startsWithSource))
    return pairCopiedBlocks(copied, lines, true);

  if (rows.length > lines.length) {
    // Some clipboard formats omit list markers. Require every source line in
    // order and leave ordinary positional imports with valid row counts alone.
    const mixed =
      !hasBullets && startsWithSource && pairCopiedBlocks(copied, lines, false);
    return mixed || { error: 'tooManyRows', count: rows.length };
  }
  if (rows.some((row) => row.trim().length > translationTextLimit))
    return { error: 'lineTooLong' };
  return {
    rows: Object.fromEntries(
      pairRows(
        rows.map((row) => row.trim()),
        lines,
      ),
    ),
  };
}

export function translationForLine(rows, line) {
  if (!line) return '';
  const row = rows?.get(line.lineId);
  return row?.original === line.text ? row.text : '';
}
