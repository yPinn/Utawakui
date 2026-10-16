// Clear space kept between two neighbouring readings, in base em.
const RUBY_GAP = 0.15;
const KANA_RE = /^[぀-ヿ]$/u;

// Signed width (base em) a reading reaches past each side of its word; base
// glyphs are full-width, so one character is one em.
function overhang(segment, scale) {
  return ([...segment.r].length * scale - [...segment.t].length) / 2;
}

// Leading space (base em) each segment needs so readings stay centred over
// their word without spreading it: a reading may hang over neighbouring kana
// by one ruby character, into the line-start margin by half of one, and
// otherwise pushes its neighbours apart.
// The ratio measures already chosen font tiers; it never chooses font sizes.
// Before browser measurement, equal-size readings reserve conservative room.
export function rubySegmentGaps(segments, scale = 1) {
  const list = Array.isArray(segments) ? segments : [];
  return list.map((segment, index) => {
    const previous = list[index - 1];
    const own = segment?.r ? overhang(segment, scale) : 0;
    const before = previous?.r ? overhang(previous, scale) : 0;
    if (segment?.r && previous?.r) {
      return round(Math.max(0, before + own + RUBY_GAP));
    }
    if (segment?.r) {
      const hang = previous
        ? hangOver([...previous.t].at(-1), scale)
        : scale / 2;
      return round(Math.max(0, own - hang));
    }
    if (previous?.r) {
      return round(Math.max(0, before - hangOver([...segment.t][0], scale)));
    }
    return 0;
  });
}

function hangOver(character, scale) {
  return KANA_RE.test(character ?? '') ? scale : 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
