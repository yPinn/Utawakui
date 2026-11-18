import { maskEdge } from '../../../shared/outputPortraitImage.json';

export function portraitSubjectBounds(alpha, width, height, edge = maskEdge) {
  let left = edge;
  let top = edge;
  let right = 0;
  let bottom = 0;
  for (let index = 0; index < alpha.length; index++) {
    if (alpha[index] < 128) continue;
    const x = index % edge;
    const y = Math.floor(index / edge);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + 1);
    bottom = Math.max(bottom, y + 1);
  }
  if (right === 0) return null;
  return {
    left: (left * width) / edge,
    top: (top * height) / edge,
    width: ((right - left) * width) / edge,
    height: ((bottom - top) * height) / edge,
  };
}

export function squarePortraitFrame(alpha, width, height, edge = maskEdge) {
  const subject = alpha
    ? portraitSubjectBounds(alpha, width, height, edge)
    : null;
  const bounds = subject ?? { left: 0, top: 0, width, height };
  const size = Math.max(bounds.width, bounds.height) * (subject ? 1.16 : 1);
  return {
    left: bounds.left + (bounds.width - size) / 2,
    top: bounds.top + (bounds.height - size) / 2,
    width: size,
    height: size,
  };
}

const snappingLines = [0.5, 1 / 3, 2 / 3];

function closestPortraitGuide(origin, size, screenSize, candidates, previous) {
  function distance({ anchor, line }) {
    return Math.abs((anchor - origin) / size - line) * screenSize;
  }
  // Keep the active line through a slightly wider range so slow drags do not flicker.
  if (previous && distance(previous) <= 11) return previous;
  let nearest = null;
  let nearby = 7;
  for (const guide of candidates) {
    const pixels = distance(guide);
    if (pixels > nearby) continue;
    nearby = pixels;
    nearest = guide;
  }
  return nearest;
}

export function snapPortraitFrame(frame, subject, viewport, previous = {}) {
  const centerX = subject.left + subject.width / 2;
  const centerY = subject.top + subject.height / 2;
  const vertical = closestPortraitGuide(
    frame.left,
    frame.width,
    viewport.width,
    snappingLines.map((line) => ({ anchor: centerX, line })),
    previous.vertical,
  );
  const horizontal = closestPortraitGuide(
    frame.top,
    frame.height,
    viewport.height,
    [
      ...snappingLines.map((line) => ({ anchor: centerY, line })),
      { anchor: subject.top + subject.height, line: 1 },
    ],
    previous.horizontal,
  );
  return {
    frame: {
      ...frame,
      left: vertical
        ? vertical.anchor - frame.width * vertical.line
        : frame.left,
      top: horizontal
        ? horizontal.anchor - frame.height * horizontal.line
        : frame.top,
    },
    vertical,
    horizontal,
  };
}

function clampFrameAxis(origin, length, imageLength) {
  const start = -length / 2;
  const end = Math.max(start, imageLength - length - start);
  return Math.min(end, Math.max(start, origin));
}

export function constrainPortraitFrame(frame, photo) {
  return {
    ...frame,
    left: clampFrameAxis(frame.left, frame.width, photo.width),
    top: clampFrameAxis(frame.top, frame.height, photo.height),
  };
}

export function zoomPortraitFrame(frame, scale, x = 0.5, y = 0.5) {
  const width = frame.width * scale;
  const height = frame.height * scale;
  return {
    left: frame.left + (frame.width - width) * x,
    top: frame.top + (frame.height - height) * y,
    width,
    height,
  };
}

export function drawPortraitCrop(canvas, photo, frame) {
  const size = Math.max(photo.width, photo.height);
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  context.imageSmoothingQuality = 'high';
  const scale = size / frame.width;
  context.drawImage(
    photo,
    -frame.left * scale,
    -frame.top * scale,
    photo.width * scale,
    photo.height * scale,
  );
}

function portraitSample(photo, opaque) {
  const sample = document.createElement('canvas');
  sample.width = sample.height = maskEdge;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (opaque) {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, maskEdge, maskEdge);
  }
  context.drawImage(photo, 0, 0, maskEdge, maskEdge);
  return context.getImageData(0, 0, maskEdge, maskEdge).data;
}

export function portraitMaskInput(photo) {
  return new Uint8Array(portraitSample(photo, true).buffer);
}

export function portraitImageBounds(photo) {
  const pixels = portraitSample(photo, false);
  const alpha = new Uint8Array(maskEdge ** 2);
  for (let index = 0; index < alpha.length; index++) {
    alpha[index] = pixels[index * 4 + 3];
  }
  return (
    portraitSubjectBounds(alpha, photo.width, photo.height) ?? {
      left: 0,
      top: 0,
      width: photo.width,
      height: photo.height,
    }
  );
}

export function adjustPortraitMask(alpha, range, edge = maskEdge) {
  if (range === 0) return alpha;
  const radius = Math.round(Math.abs(range) / 25);
  const extreme = range > 0 ? Math.min : Math.max;
  const gamma = 2 ** (range / 50);
  const horizontal = new Uint8Array(alpha.length);
  const adjusted = new Uint8Array(alpha.length);
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const pixel = y * edge + x;
      let value = alpha[pixel];
      for (
        let offset = Math.max(0, x - radius);
        offset <= Math.min(edge - 1, x + radius);
        offset++
      ) {
        value = extreme(value, alpha[y * edge + offset]);
      }
      horizontal[pixel] = value;
    }
  }
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const pixel = y * edge + x;
      let value = horizontal[pixel];
      for (
        let offset = Math.max(0, y - radius);
        offset <= Math.min(edge - 1, y + radius);
        offset++
      ) {
        value = extreme(value, horizontal[offset * edge + x]);
      }
      adjusted[pixel] = Math.round((value / 255) ** gamma * 255);
    }
  }
  return adjusted;
}

export function sharpenPortraitMask(alpha, strength) {
  if (!strength) return alpha;
  const contrast = 1 + (strength / 100) * 3;
  return alpha.map((value) =>
    Math.round(Math.max(0, Math.min(255, (value - 127.5) * contrast + 127.5))),
  );
}

export function applyPortraitEdits(alpha, edits) {
  if (!edits) return alpha;
  return alpha.map((value, index) => {
    const amount = edits[index] / 255;
    return Math.round(value + (amount > 0 ? 255 - value : value) * amount);
  });
}

function rasterizeLasso(points, edge) {
  const selected = new Uint8Array(edge ** 2);
  let count = 0;
  for (let y = 0; y < edge; y++) {
    const line = y + 0.5;
    const crossings = [];
    let previous = points.at(-1);
    for (const point of points) {
      if (point.y > line !== previous.y > line) {
        const fraction = (line - previous.y) / (point.y - previous.y);
        crossings.push(previous.x + fraction * (point.x - previous.x));
      }
      previous = point;
    }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = Math.min(
        edge,
        Math.max(0, Math.ceil(crossings[index] - 0.5)),
      );
      const to = Math.min(
        edge,
        Math.max(0, Math.ceil(crossings[index + 1] - 0.5)),
      );
      selected.fill(1, y * edge + from, y * edge + to);
      count += to - from;
    }
  }
  return count >= 4 ? selected : null;
}

export function editPortraitLasso(edits, alpha, points, mode, edge = maskEdge) {
  if (points.length < 3) return null;
  const selected = rasterizeLasso(points, edge);
  if (!selected) return null;

  const next = edits?.slice() ?? new Int16Array(alpha.length);
  const restoring = mode === 'restore';
  let changed = false;
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    if (!selected[pixel]) continue;
    const previous = next[pixel];
    if (
      restoring
        ? alpha[pixel] === 255 && previous >= 0
        : alpha[pixel] === 0 && previous <= 0
    )
      continue;
    const x = pixel % edge;
    const y = Math.floor(pixel / edge);
    let inside = 0;
    let total = 0;
    for (
      let row = Math.max(0, y - 1);
      row <= Math.min(edge - 1, y + 1);
      row++
    ) {
      for (
        let column = Math.max(0, x - 1);
        column <= Math.min(edge - 1, x + 1);
        column++
      ) {
        inside += selected[row * edge + column];
        total++;
      }
    }
    // Feather inward at the lasso boundary. The existing matte protects
    // high-confidence pixels on the rim, while the enclosed interior is edited fully.
    const confidence = restoring ? alpha[pixel] : 255 - alpha[pixel];
    const weight =
      inside === total
        ? 1
        : (inside / total) * (0.55 + (0.45 * confidence) / 255);
    const opacity = Math.round(255 * weight);
    const updated = restoring
      ? Math.max(previous, opacity)
      : Math.min(previous, -opacity);
    next[pixel] = updated;
    changed ||= updated !== previous;
  }
  return changed ? next : null;
}

export function cutoutPortraitPhoto(photo, alpha) {
  const mask = document.createElement('canvas');
  mask.width = mask.height = maskEdge;
  const maskContext = mask.getContext('2d');
  const pixels = maskContext.createImageData(maskEdge, maskEdge);
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    pixels.data[pixel * 4 + 3] = alpha[pixel];
  }
  maskContext.putImageData(pixels, 0, 0);

  const cutout = document.createElement('canvas');
  cutout.width = photo.width;
  cutout.height = photo.height;
  const context = cutout.getContext('2d');
  context.drawImage(photo, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.imageSmoothingQuality = 'high';
  context.drawImage(mask, 0, 0, cutout.width, cutout.height);
  return cutout;
}
