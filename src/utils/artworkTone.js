// A cover's material colour for a faint backdrop tint. Saturated mid-tone
// pixels dominate so white borders or black letterboxing do not wash it out.
const SAMPLE_SIZE = 16;
const MIN_WEIGHT = 0.05;
const tones = new Map();

export function toneFromPixels(data) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;
  for (let index = 0; index + 3 < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = (max - min) / 255;
    const lightness = (max + min) / 510;
    const weight = saturation * (1 - Math.abs(2 * lightness - 1)) + MIN_WEIGHT;
    red += r * weight;
    green += g * weight;
    blue += b * weight;
    total += weight;
  }
  if (total === 0) return null;
  const channel = (sum) => Math.round(sum / total);
  return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`;
}

function sampleImage(url, createImage, createCanvas) {
  return new Promise((resolve) => {
    const image = createImage();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = createCanvas(SAMPLE_SIZE);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(toneFromPixels(data));
      } catch {
        // A tainted or undecodable image simply has no tint.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function createSampleCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function loadArtworkTone(
  url,
  { createImage = () => new Image(), createCanvas = createSampleCanvas } = {},
) {
  if (!url) return Promise.resolve(null);
  if (!tones.has(url)) {
    tones.set(url, sampleImage(url, createImage, createCanvas));
  }
  return tones.get(url);
}
