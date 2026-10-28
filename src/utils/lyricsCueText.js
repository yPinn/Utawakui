// Shared text/ruby intersections for an existing cue. This never creates times
// or changes the original reading/timing partitions.
export function lyricsCueTextGroups(frame, readingSegments) {
  let cursor = 0;
  const chunks = frame.chunks.map((chunk) => {
    const from = cursor;
    cursor += chunk.text.length;
    return {
      from,
      to: cursor,
      active: chunk.state === 'active' && chunk.cueActive !== false,
    };
  });
  const readings =
    readingSegments?.map((s) => s.t).join('') === frame.text
      ? readingSegments
      : [{ t: frame.text }];
  cursor = 0;
  return readings.map((reading, index) => {
    const from = cursor;
    cursor += reading.t.length;
    const to = cursor;
    const cuts = [
      ...new Set([
        from,
        to,
        ...Array.from(reading.t.matchAll(/\s+/gu), (match) => [
          from + match.index,
          from + match.index + match[0].length,
        ]).flat(),
        ...chunks
          .flatMap((chunk) => [chunk.from, chunk.to])
          .filter((cut) => cut > from && cut < to),
      ]),
    ].sort((a, b) => a - b);
    return {
      from,
      index,
      reading: reading.r,
      parts: cuts.slice(0, -1).map((start, i) => ({
        from: start,
        to: cuts[i + 1],
        text: frame.text.slice(start, cuts[i + 1]),
        cue:
          /\S/u.test(frame.text.slice(start, cuts[i + 1])) &&
          chunks.some(
            (chunk) =>
              chunk.active && chunk.from < cuts[i + 1] && chunk.to > start,
          ),
      })),
    };
  });
}
