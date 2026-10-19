'use strict';

function omitInteriorWord(text, language) {
  const spaced = [...text.matchAll(/\S+/gu)].map((m) => ({
    index: m.index,
    segment: m[0],
  }));
  const words =
    spaced.length >= 3
      ? spaced
      : [
          ...new Intl.Segmenter(language, { granularity: 'word' }).segment(
            text,
          ),
        ].filter((s) => s.isWordLike);
  if (words.length < 3) throw Error('at least three words required');
  const word = words[Math.floor(words.length / 2)];
  const from = word.index;
  let to = from + word.segment.length;
  while (to < text.length && /\s/u.test(text[to])) to++;
  return {
    text: text.slice(0, from) + text.slice(to),
    removed: { from, to },
    mapFrom: (offset) =>
      offset < from ? offset : offset < to ? null : offset - (to - from),
  };
}

function replaceInterval(input, startMs, endMs, donor, sampleRate = 16000) {
  if (
    !Buffer.isBuffer(input) ||
    input.length % 4 ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs ||
    (endMs * sampleRate) / 1000 > input.length / 4 ||
    (donor !== null && (!Buffer.isBuffer(donor) || donor.length % 4))
  )
    throw Error('invalid audio interval');
  const from = Math.round((startMs * sampleRate) / 1000) * 4;
  const to = Math.round((endMs * sampleRate) / 1000) * 4;
  const output = Buffer.from(input);
  output.fill(0, from, to);
  if (donor) donor.copy(output, from, 0, Math.min(donor.length, to - from));
  return output;
}

function timestamp(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) throw Error('invalid cue time');
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

function outerVtt(lines) {
  return `WEBVTT\n\n${lines
    .map((line) => {
      if (
        typeof line.text !== 'string' ||
        !line.text.trim() ||
        /[\r\n<>]/u.test(line.text) ||
        line.endMs <= line.startMs
      )
        throw Error('invalid coarse cue');
      return `${timestamp(line.startMs)} --> ${timestamp(line.endMs)}\n${line.text}\n`;
    })
    .join('\n')}`;
}

function floatWav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(samples.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(64000, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

module.exports = { omitInteriorWord, replaceInterval, outerVtt, floatWav };
