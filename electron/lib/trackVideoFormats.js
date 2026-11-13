'use strict';

const FHD_HEIGHT = 1080;
const MAX_VIDEO_REFERENCE_BYTES = 16 * 1024 ** 2;

function planVideoReference(formats) {
  const candidates = formats.filter((format) => {
    const { format_id, ext, vcodec, acodec, protocol } = format;
    const size = format.filesize ?? format.filesize_approx;
    return (
      typeof format_id === 'string' &&
      /^[\w.-]{1,80}$/u.test(format_id) &&
      ['m4a', 'webm'].includes(ext) &&
      vcodec === 'none' &&
      typeof acodec === 'string' &&
      acodec !== 'none' &&
      ['https', 'http'].includes(protocol) &&
      (!Number.isFinite(size) ||
        (size > 0 && size <= MAX_VIDEO_REFERENCE_BYTES))
    );
  });
  candidates.sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
  const best = candidates[0];
  return best ? { id: best.format_id, ext: best.ext } : null;
}

function planVideoFormats(formats) {
  const byHeight = new Map();
  for (const format of formats) {
    const {
      format_id: id,
      height,
      ext,
      vcodec,
      acodec,
      dynamic_range,
    } = format;
    if (
      typeof id !== 'string' ||
      !/^[\w.-]{1,80}$/u.test(id) ||
      !Number.isSafeInteger(height) ||
      height <= 0 ||
      ext !== 'mp4' ||
      typeof vcodec !== 'string' ||
      !/^(?:avc1(?:\.|$)|h264$)/iu.test(vcodec) ||
      (dynamic_range && dynamic_range !== 'SDR')
    ) {
      continue;
    }

    const hasAudio = acodec !== 'none';
    if (hasAudio && byHeight.get(height)?.hasAudio === false) continue;
    const size = format.filesize ?? format.filesize_approx;
    byHeight.set(height, {
      hasAudio,
      choice: {
        id,
        height,
        sizeBytes: Number.isSafeInteger(size) && size > 0 ? size : null,
      },
    });
  }

  const choices = Array.from(byHeight.values(), ({ choice }) => choice).sort(
    (left, right) => left.height - right.height,
  );
  const defaultChoice = choices.findLast(({ height }) => height <= FHD_HEIGHT);
  return { defaultId: defaultChoice?.id ?? null, choices };
}

module.exports = {
  MAX_VIDEO_REFERENCE_BYTES,
  planVideoFormats,
  planVideoReference,
};
