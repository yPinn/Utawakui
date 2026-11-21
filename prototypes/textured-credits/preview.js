/* global cancelAnimationFrame, document, matchMedia, requestAnimationFrame */

const cues = [
  {
    start: 240,
    end: 2750,
    line: '夜明けまで、声をたどる',
    translation: '循著聲音，直到天亮',
  },
  {
    start: 2930,
    end: 5700,
    line: '遠い波の向こうに、まだ光がある',
    translation: '遙遠的浪潮之外，仍有光',
  },
  { start: 5860, end: 6620, line: '風が止む', translation: '風停了' },
];
const duration = 6900;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const stage = document.querySelector('#stage');
const credit = document.querySelector('#credit');
const text = document.querySelector('#text');
const texture = document.querySelector('#texture');
const replay = document.querySelector('#replay');
const toggle = document.querySelector('#toggle');
const speed = document.querySelector('#speed');
const backdrop = document.querySelector('#backdrop');
const timeline = document.querySelector('#timeline');
const phase = document.querySelector('#phase');

let activeCue;
let position = 0;
let animation = 0;
let lastFrame = null;

function makeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(canvas.width, canvas.height);
  let seed = 127;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = seed / 4294967296;
      const vein = Math.sin(
        y * 0.51 + x * 0.17 + 2.8 * Math.sin(x * 0.042 + y * 0.05),
      );
      const fibers = Math.sin(y * 1.37 - x * 0.13 + Math.sin(x * 0.16));
      const alpha = Math.max(
        0,
        vein * 0.67 + fibers * 0.2 + grain * 0.5 - 0.25,
      );
      pixels.data[(y * canvas.width + x) * 4 + 3] = alpha * 255;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

function ease(value) {
  const fraction = Math.min(1, Math.max(0, value));
  return fraction * fraction * (3 - 2 * fraction);
}

function render(time) {
  position = time;
  timeline.value = String(Math.round(time));
  const cue = cues.find(({ start, end }) => time >= start && time < end);

  if (cue !== activeCue) {
    activeCue = cue;
    for (const layer of [text, texture]) {
      layer.querySelector('.credit__line').textContent = cue?.line ?? '';
      layer.querySelector('.credit__translation').textContent =
        cue?.translation ?? '';
    }
  }

  credit.hidden = !cue;
  let label = '留白';
  if (cue) {
    const elapsed = time - cue.start;
    const remaining = cue.end - time;
    const enter = Math.min(200, (cue.end - cue.start) * 0.2);
    const exit = Math.min(180, (cue.end - cue.start) * 0.2);
    const inkOpacity =
      ease((elapsed / enter - 0.22) / 0.78) * ease(remaining / exit);
    const textureOpacity =
      ease(elapsed / (enter * 0.29)) *
      (1 - ease((elapsed / enter - 0.35) / 0.65));
    text.style.opacity = reduceMotion.matches ? '1' : String(inkOpacity);
    texture.style.opacity = reduceMotion.matches ? '0' : String(textureOpacity);
    label = elapsed < enter ? '入場' : remaining < exit ? '淡出' : '停留';
  }
  phase.value = `${(time / 1000).toFixed(2)} 秒 · ${label}`;
}

function pause() {
  cancelAnimationFrame(animation);
  animation = 0;
  lastFrame = null;
  toggle.textContent = '播放';
}

function tick(now) {
  const elapsed = lastFrame === null ? 0 : now - lastFrame;
  lastFrame = now;
  render(Math.min(duration, position + elapsed * Number(speed.value)));
  if (position < duration) animation = requestAnimationFrame(tick);
  else pause();
}

function play() {
  if (animation) return;
  if (position >= duration) render(0);
  toggle.textContent = '暫停';
  animation = requestAnimationFrame(tick);
}

stage.style.setProperty('--texture', `url("${makeTexture()}")`);
timeline.max = String(duration);
timeline.addEventListener('input', () => {
  pause();
  render(Number(timeline.value));
});
backdrop.addEventListener('change', () => {
  stage.dataset.backdrop = backdrop.value;
});
reduceMotion.addEventListener('change', () => {
  pause();
  render(position);
});
toggle.addEventListener('click', () => {
  if (animation) pause();
  else play();
});
replay.addEventListener('click', () => {
  pause();
  render(0);
  play();
});

render(reduceMotion.matches ? 750 : 0);
if (!reduceMotion.matches) play();
