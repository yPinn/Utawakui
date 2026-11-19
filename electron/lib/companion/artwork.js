'use strict';

const fs = require('node:fs/promises');
const {
  MAX_ARTWORK_BYTES,
  hasValidArtworkDimensions,
  inspectArtworkImage,
} = require('../artwork/image');

const THUMB_EDGE = 160;

async function readCompanionArtwork(
  filename,
  createImage,
  { preserveAlpha = false } = {},
) {
  if (!filename) return null;
  let file;
  try {
    file = await fs.open(filename, 'r');
    const { size } = await file.stat();
    if (size <= 0 || size > MAX_ARTWORK_BYTES) return null;
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await file.read(buffer);
    const info = inspectArtworkImage(buffer);
    if (bytesRead !== size || !hasValidArtworkDimensions(info)) return null;
    // Electron nativeImage decodes PNG and JPEG. The browser decodes WebP.
    if (info.mimeType === 'image/webp')
      return { body: buffer, type: info.mimeType };
    const image = createImage(buffer);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    const thumbnail =
      Math.max(width, height) <= THUMB_EDGE
        ? image
        : image.resize(
            width >= height ? { width: THUMB_EDGE } : { height: THUMB_EDGE },
          );
    return preserveAlpha && info.mimeType === 'image/png'
      ? { body: thumbnail.toPNG(), type: 'image/png' }
      : { body: thumbnail.toJPEG(82), type: 'image/jpeg' };
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => {});
  }
}

module.exports = { readCompanionArtwork };
