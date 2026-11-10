export const translationTextLimit = 1000;
export const translationImportLimit = 256 * 1024;

export function pairTranslationText(text, lines) {
  const rows = text
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');
  while (rows.length && !rows.at(-1).trim()) rows.pop();
  if (
    rows.length === 0 ||
    rows.length > lines.length ||
    rows.some((row) => row.trim().length > translationTextLimit)
  )
    return null;
  return Object.fromEntries(
    rows.flatMap((row, index) =>
      row.trim() ? [[lines[index].lineId, row.trim()]] : [],
    ),
  );
}

export function translationForLine(rows, line) {
  if (!line) return '';
  const row = rows?.get(line.lineId);
  return row?.original === line.text ? row.text : '';
}
