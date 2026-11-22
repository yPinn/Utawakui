const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

export function sampleGraphemes(text) {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}
