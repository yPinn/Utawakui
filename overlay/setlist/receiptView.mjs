import { createReceiptMotionController } from './receiptMotion.mjs';
import { createSetlistCurrentMotionController } from './setlistMotion.mjs';
import { receiptPageLayout } from '../../shared/presentation/receiptSetlist.mjs';

// This DOM adapter is shared by the Browser Source and the Vue Gallery preview.
export function createReceiptView(host, { gsap = null } = {}) {
  const document = host.ownerDocument;
  host.innerHTML = `<section class="receipt-setlist" data-direction="down">
    <div class="receipt-setlist__paper" aria-hidden="true"></div>
    <div class="receipt-setlist__body">
      <header class="receipt-setlist__header"><h1 class="receipt-setlist__heading">SETLIST</h1>
      </header>
      <section class="receipt-setlist__current" aria-label="目前演唱曲目">
        <h2 class="receipt-setlist__label">NOW PLAYING</h2><strong class="receipt-setlist__current-title"></strong><span class="receipt-setlist__current-artist"></span>
      </section>
      <section class="receipt-setlist__history" aria-label="已唱紀錄">
        <div class="receipt-setlist__viewport"><ol class="receipt-setlist__list"></ol></div>
      </section>
    </div>
  </section>`;
  const find = (name) => host.querySelector(`.receipt-setlist__${name}`);
  const root = host.querySelector('.receipt-setlist');
  const currentTitle = find('current-title');
  const currentArtist = find('current-artist');
  const history = find('history');
  const viewport = find('viewport');
  const list = find('list');
  let visible = false;
  let lastFrame = null;
  let latestFrame = null;
  let active = true;
  let settling = false;
  let configuredDirection = 'down';
  let scale = 1;
  let measurementFrame = null;
  let stopped = false;
  let measurementSignature = '';

  function measure() {
    const unit = Math.max(0.01, host.clientWidth / 480);
    const heights = [...list.children].map(
      (row) => row.getBoundingClientRect().height,
    );
    const available = history.clientHeight;
    const direction = root.dataset.direction;
    measurementSignature = JSON.stringify([available, direction, heights]);
    return {
      rowHeight: 72 * scale * unit,
      totalHeight: heights.reduce((sum, height) => sum + height, 0),
      feedHeight: direction === 'up' ? heights.at(-1) : heights[0],
      pages: receiptPageLayout(heights, available, direction),
    };
  }
  function render(frame, rows, settings) {
    lastFrame = frame;
    host.hidden = !visible || !frame.visible;
    root.dataset.direction = settings.receiptDirection;
    currentTitle.textContent = frame.current?.title || '等待下一首';
    currentTitle.title = frame.current?.title || '';
    currentArtist.textContent = frame.current?.artist || '';
    if (rows !== null) {
      list.replaceChildren(
        ...rows.map((item) => {
          const row = document.createElement('li');
          row.className = 'receipt-setlist__row';
          row.dataset.ordinal = String(item.ordinal);
          const ordinal = document.createElement('span');
          ordinal.className = 'receipt-setlist__ordinal';
          ordinal.textContent = String(item.ordinal).padStart(2, '0');
          const title = document.createElement('strong');
          title.className = 'receipt-setlist__track';
          title.textContent = item.title;
          title.prepend(ordinal);
          title.title = item.title;
          const artist = document.createElement('span');
          artist.className = 'receipt-setlist__artist';
          artist.textContent = item.artist;
          row.append(title, artist);
          return row;
        }),
      );
    }
    viewport.hidden = frame.history.length === 0;
  }
  const motion = createReceiptMotionController({
    gsap,
    list,
    render,
    measure,
    setViewportHeight: (height) => {
      viewport.style.blockSize = `${Math.max(0, height)}px`;
    },
    onPhase: (phase) => {
      root.dataset.historyMotion = phase;
    },
  });
  const currentMotion = createSetlistCurrentMotionController({
    gsap,
    current: [currentTitle, currentArtist],
    root,
    fadeOnly: true,
    identity: (frame) =>
      JSON.stringify([
        frame.sourceName,
        frame.current,
        frame.current ? frame.completedCount : null,
      ]),
    commitFrame: (frame) => motion.update(frame, { settle: settling }),
  });
  function update(frame, { settle = false } = {}) {
    latestFrame = frame;
    settling = settle || !active;
    currentMotion.update(frame, { settle: settling });
    settling = false;
  }
  function scheduleMeasurement() {
    if (stopped) return;
    if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
    measurementFrame = requestAnimationFrame(() => {
      measurementFrame = null;
      const previous = measurementSignature;
      measure();
      if (measurementSignature !== previous) motion.refresh();
    });
  }
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(scheduleMeasurement)
      : null;
  observer?.observe(host);
  observer?.observe(history);
  return {
    update,
    configure(appearance) {
      const nextScale =
        { small: 0.85, medium: 1, large: 1.2 }[appearance?.fontScale] ?? 1;
      const scaleChanged = nextScale !== scale;
      const nextDirection =
        appearance?.receiptDirection === 'up' ? 'up' : 'down';
      const directionChanged = nextDirection !== configuredDirection;
      configuredDirection = nextDirection;
      scale = nextScale;
      if (scaleChanged)
        root.style.setProperty('--receipt-type-scale', String(scale));
      motion.configure(appearance);
      if ((scaleChanged || directionChanged) && latestFrame)
        update(latestFrame, { settle: true });
      if (scaleChanged) scheduleMeasurement();
    },
    setVisible(value) {
      visible = value;
      host.hidden = !value || !lastFrame?.visible;
    },
    setActive(value) {
      if (active === Boolean(value)) return;
      active = Boolean(value);
      if (active) {
        motion.resume();
        currentMotion.resume();
      } else {
        motion.suspend();
        currentMotion.suspend();
        if (latestFrame) update(latestFrame, { settle: true });
      }
    },
    setReducedMotion(value) {
      motion.setReducedMotion(value);
      currentMotion.setReducedMotion(value);
    },
    refresh: scheduleMeasurement,
    destroy() {
      stopped = true;
      if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
      observer?.disconnect();
      currentMotion.destroy();
      motion.destroy();
      host.replaceChildren();
    },
  };
}
