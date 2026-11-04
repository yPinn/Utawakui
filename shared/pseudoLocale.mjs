// Development-only pseudo locale over en-US: each translated string is
// accented, padded and bracketed so truncation, hard-coded text and
// concatenated fragments stand out.
export const PSEUDO_LOCALE = 'en-XA';

const ACCENTED = Object.fromEntries(
  [...'abcdeghiklnorstuwyzABCDEGHIKLNORSTUWYZ'].map((letter, index) => [
    letter,
    [...'áƀçđéĝĥîķļñöŕšţûŵýžÁßÇĐÉĜĤÎĶĻÑÖŔŠŢÛŴÝŽ'][index],
  ]),
);
const EXPANSION = 0.4;

// Applied after interpolation, so filled-in values are accented too.
export function pseudoText(text) {
  if (typeof text !== 'string' || !/[A-Za-z]/u.test(text)) return text;
  const body = text.trim();
  const accented = [...body]
    .map((character) => ACCENTED[character] ?? character)
    .join('');
  const padding = '·'.repeat(Math.ceil(body.length * EXPANSION));
  const leading = text.match(/^\s*/u)[0];
  const trailing = text.match(/\s*$/u)[0];
  return `${leading}⟦${accented}${padding}⟧${trailing}`;
}
