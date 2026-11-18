const MAX_SOURCE_BYTES = 10 * 1024 ** 2;
const MAX_SOURCE_PIXELS = 24_000_000;
const MAX_PREVIEW_EDGE = 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const validExtension = /\.(?:png|jpe?g|webp)$/iu;

export function performerGuideImageBounds({ data, width, height }) {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return right
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

export async function trimPerformerGuideImage(source, width, height) {
  if (!width || !height || width * height > MAX_SOURCE_PIXELS) return null;

  const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height));
  const sample = document.createElement('canvas');
  sample.width = Math.max(1, Math.round(width * scale));
  sample.height = Math.max(1, Math.round(height * scale));
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const bounds = performerGuideImageBounds(
    context.getImageData(0, 0, sample.width, sample.height),
  );
  if (!bounds) return null;

  let output = sample;
  if (bounds.width !== sample.width || bounds.height !== sample.height) {
    output = document.createElement('canvas');
    output.width = bounds.width;
    output.height = bounds.height;
    output.getContext('2d').drawImage(sample, -bounds.left, -bounds.top);
  }
  return new Promise((resolve) => output.toBlob(resolve, 'image/png'));
}

export async function preparePerformerGuideImage(file) {
  if (
    !file?.size ||
    file.size > MAX_SOURCE_BYTES ||
    !(file.type ? IMAGE_TYPES.has(file.type) : validExtension.test(file.name))
  ) {
    return null;
  }

  const source = await createImageBitmap(file);
  try {
    return await trimPerformerGuideImage(source, source.width, source.height);
  } finally {
    source.close();
  }
}

const STORE = 'images';
const IMAGE_KEY = 'performer-guide';

async function accessImage(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('utawakui.output-preview', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function loadPerformerGuideImage() {
  return accessImage('readonly', (store) => store.get(IMAGE_KEY));
}

export function savePerformerGuideImage(image) {
  return accessImage('readwrite', (store) =>
    image ? store.put(image, IMAGE_KEY) : store.delete(IMAGE_KEY),
  );
}
