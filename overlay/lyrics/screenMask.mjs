import { lyricsDisplayBatchKey } from '../../shared/presentation/lyricsDisplayFrame.mjs';
import { outputScreenMaskLayout } from '../../shared/outputAppearance.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MASK_PATHS = {
  'framed-vertical':
    'M0 0H1920V1080H0Z M324 57C397 22 1519 22 1596 57C1643 70 1643 1010 1596 1023C1519 1058 397 1058 324 1023C277 1010 277 70 324 57Z',
  'cinema-letterbox': 'M0 0H1920V132H0Z M0 948H1920V1080H0Z',
};
const sessions = new WeakMap();

function drawMask(element, layout) {
  const document = element.ownerDocument;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1920 1080');
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', MASK_PATHS[layout]);
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  element.replaceChildren(svg);
}

function stopFade(caption, state) {
  state.timeline?.kill();
  state.timeline = null;
  caption.style.removeProperty('opacity');
}

export function clearScreenMaskFrame({ root, screenMask, current }) {
  const state = sessions.get(root);
  if (!state) return;
  stopFade(current, state);
  current.replaceChildren();
  delete current.dataset.currentText;
  current.hidden = false;
  screenMask.replaceChildren();
  screenMask.hidden = true;
  root.hidden = true;
  sessions.delete(root);
}

export function renderScreenMaskFrame(
  { root, screenMask, current },
  frame,
  { screenMaskLayout, gsap, reducedMotion },
) {
  if (!screenMask) return;
  const layout = outputScreenMaskLayout(screenMaskLayout);
  root.dataset.screenMask = layout;
  root.lang = frame.language || 'und';
  if (!frame.screenMask?.visible) {
    clearScreenMaskFrame({ root, screenMask, current });
    root.hidden = true;
    return;
  }
  let state = sessions.get(root);
  if (state?.layout !== layout) {
    clearScreenMaskFrame({ root, screenMask, current });
    current.removeAttribute('aria-label');
    drawMask(screenMask, layout);
    screenMask.hidden = false;
    state = { layout };
    sessions.set(root, state);
  }
  root.hidden = false;

  const text = frame.visible ? frame.currentText?.trim() : '';
  const rows = text ? (frame.screenMask.rows ?? [text]) : [];
  const key = JSON.stringify([lyricsDisplayBatchKey(frame), rows]);
  if (key !== state.key) {
    stopFade(current, state);
    current.replaceChildren(
      ...rows.map((row) => {
        const span = current.ownerDocument.createElement('span');
        span.dir = 'auto';
        span.textContent = row.trim();
        return span;
      }),
    );
    current.dataset.currentText = text ?? '';
    current.hidden = !rows.length;
    state.key = key;
  }

  const { durationMs, elapsedMs, playing, rate = 1 } = frame.screenMask;
  if (
    layout !== 'cinema-letterbox' ||
    !rows.length ||
    !playing ||
    frame.timelineDiscontinuity ||
    reducedMotion ||
    typeof gsap?.timeline !== 'function' ||
    !(durationMs / rate >= 400) ||
    !Number.isFinite(elapsedMs)
  ) {
    if (state.timeline) stopFade(current, state);
    return;
  }

  const needsTimeline =
    !state.timeline || state.durationMs !== durationMs || state.rate !== rate;
  if (needsTimeline) {
    stopFade(current, state);
    const duration = durationMs / 1000;
    const timeline = gsap.timeline({ paused: true });
    timeline.fromTo(
      current,
      { opacity: 0 },
      { opacity: 1, duration: 0.1 * rate, ease: 'power1.out' },
    );
    timeline.to(
      current,
      { opacity: 0, duration: 0.075 * rate, ease: 'power1.in' },
      duration - 0.075 * rate,
    );
    state.timeline = timeline;
    state.durationMs = durationMs;
    state.rate = rate;
  }
  const time = Math.min(durationMs, elapsedMs) / 1000;
  if (needsTimeline || Math.abs(state.timeline.time() - time) > 0.05 * rate)
    state.timeline.time(time);
  state.timeline.timeScale(rate).play();
}
