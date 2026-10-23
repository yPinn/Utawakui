import { createReceiptMotionController } from './receiptMotion.mjs';

// This DOM adapter is shared by the Browser Source and the Vue Gallery preview.
export function createReceiptView(host, { gsap = null } = {}) {
  const document = host.ownerDocument;
  host.innerHTML = `<section class="receipt-setlist" data-direction="down">
    <div class="receipt-setlist__paper" aria-hidden="true"></div>
    <div class="receipt-setlist__body">
      <header class="receipt-setlist__header"><h1 class="receipt-setlist__heading">SETLIST</h1>
        <div class="receipt-setlist__metadata"><span class="receipt-setlist__source"></span><span class="receipt-setlist__count"></span></div>
      </header>
      <section class="receipt-setlist__current" aria-label="目前演唱曲目">
        <h2 class="receipt-setlist__label">NOW PLAYING</h2><strong class="receipt-setlist__current-title"></strong><span class="receipt-setlist__current-artist"></span>
      </section>
      <section class="receipt-setlist__history" aria-label="已唱紀錄">
        <div class="receipt-setlist__viewport"><ol class="receipt-setlist__list"></ol></div><p class="receipt-setlist__empty">尚無已唱紀錄</p>
      </section>
    </div>
  </section>`;
  const find = (name) => host.querySelector(`.receipt-setlist__${name}`);
  const root = host.querySelector('.receipt-setlist');
  const source = find('source');
  const count = find('count');
  const currentTitle = find('current-title');
  const currentArtist = find('current-artist');
  const history = find('history');
  const viewport = find('viewport');
  const list = find('list');
  const empty = find('empty');
  let visible = false;
  let lastFrame = null;
  let scale = 1;
  let measurementFrame = null;
  let stopped = false;

  function measure() {
    const unit = Math.max(0.01, host.clientWidth / 480);
    const rowHeight = 96 * scale * unit;
    const capacity = Math.max(1, Math.floor(history.clientHeight / rowHeight));
    viewport.style.blockSize = `${Math.max(0, Math.min(history.clientHeight, capacity * rowHeight))}px`;
    return { rowHeight, capacity };
  }
  function render(frame, rows, settings) {
    lastFrame = frame;
    host.hidden = !visible || !frame.visible;
    root.dataset.direction = settings.receiptDirection;
    source.textContent = frame.sourceName || '演唱紀錄';
    source.title = frame.sourceName;
    count.textContent = `${frame.countIsComplete ? '已唱' : '播放紀錄'} ${frame.completedCount} 首`;
    count.title =
      frame.completedCount > frame.history.length
        ? `目前可回顧最近 ${frame.history.length} 首`
        : '';
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
          title.title = item.title;
          const artist = document.createElement('span');
          artist.className = 'receipt-setlist__artist';
          artist.textContent = item.artist;
          row.append(ordinal, title, artist);
          return row;
        }),
      );
    }
    empty.hidden = frame.history.length > 0;
    viewport.hidden = frame.history.length === 0;
  }
  const motion = createReceiptMotionController({
    gsap,
    list,
    render,
    measure,
    onPhase: (phase) => {
      root.dataset.historyMotion = phase;
    },
  });
  function scheduleMeasurement() {
    if (stopped) return;
    if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
    measurementFrame = requestAnimationFrame(() => {
      measurementFrame = null;
      motion.refresh();
    });
  }
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(scheduleMeasurement)
      : null;
  observer?.observe(host);
  observer?.observe(history);
  return {
    update: motion.update,
    configure(appearance) {
      const nextScale =
        { small: 0.85, medium: 1, large: 1.2 }[appearance?.fontScale] ?? 1;
      const scaleChanged = nextScale !== scale;
      scale = nextScale;
      if (scaleChanged)
        root.style.setProperty('--receipt-type-scale', String(scale));
      motion.configure(appearance);
      if (scaleChanged) scheduleMeasurement();
    },
    setVisible(value) {
      visible = value;
      host.hidden = !value || !lastFrame?.visible;
    },
    setActive(value) {
      if (value) motion.resume();
      else motion.suspend();
    },
    setReducedMotion: motion.setReducedMotion,
    refresh: scheduleMeasurement,
    destroy() {
      stopped = true;
      if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
      observer?.disconnect();
      motion.destroy();
      host.replaceChildren();
    },
  };
}
