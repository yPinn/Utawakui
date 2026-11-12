import {
  normalizeOutputAppearance,
  OUTPUT_APPEARANCE_DEFAULTS,
} from '../../shared/outputAppearance.mjs';
import { overlayText } from '../shared/messages.mjs';
import { createRibbonFlashback } from './ribbonFlashback.mjs';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 810;
const MAX_ROWS = 14;
const HISTORY_HEIGHT = 659;
const STYLE_SEED = 'ribbon-v8';

export function ribbonTitleScript(title) {
  if (/\p{Script=Hangul}/u.test(title)) return 'hangul';
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) return 'kana';
  if (/\p{Script=Han}/u.test(title)) return 'han';
  return 'default';
}

export function ribbonTitleRuns(title) {
  // Keep typographic quotes with their Latin text, while fullwidth symbols
  // and punctuation next to CJK text keep the title's regional font.
  return title
    .split(/([ -~\u00a0-\u024f\u1e00-\u1eff\u2018-\u201f]+)/u)
    .flatMap((text, index) =>
      text
        ? [
            {
              text,
              latin:
                index % 2 === 1 &&
                /[!-~\u00a1-\u024f\u1e00-\u1eff]/u.test(text),
            },
          ]
        : [],
    );
}

export function ribbonPages(rows, overlap, retainedPageEnd) {
  const pages = [];
  let page = [];
  let used = 0;
  for (const row of rows) {
    if (
      page.length &&
      (page.length === MAX_ROWS ||
        used + row.height - overlap > HISTORY_HEIGHT ||
        (page[0].track.ordinal <= retainedPageEnd &&
          row.track.ordinal > retainedPageEnd))
    ) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += row.height - (page.length ? overlap : 0);
    page.push(row);
  }
  if (page.length) pages.push(page);
  return pages;
}

function sample(seed, min, max) {
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  const unit = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
  return min + Math.floor(unit * (max - min + 1));
}

function trimAtSeam(index, overlap) {
  const gapSlot = sample(STYLE_SEED + '/gap/' + Math.floor(index / 5), 1, 3);
  if (index % 5 !== gapSlot) return 0;
  return (sample(STYLE_SEED + '/gap-size/' + index, 1, 2) + overlap) / 2;
}

export function ribbonBandStyle(track, overlap) {
  const index = track.ordinal - 1;
  const seed = [STYLE_SEED, track.ordinal, track.trackId || track.title].join(
    '/',
  );
  const value = (field, min, max) => sample(seed + '/' + field, min, max);
  const phase = sample(STYLE_SEED + '/edge-phase', 0, 1);
  const start =
    (index + phase) % 2 === 0
      ? value('outer-edge', -32, -20)
      : value('inner-edge', -15, -3);
  return {
    ink: value('ink', 0, 99) < 29 ? 'black' : 'red',
    start,
    tail: value('tail', 12, 36),
    tilt:
      (value('tilt', 21, 36) / 10) * (value('tilt-side', 0, 1) === 0 ? -1 : 1),
    trimTop: Math.floor(trimAtSeam(index, overlap)),
    trimBottom: Math.ceil(trimAtSeam(index + 1, overlap)),
    fold:
      value('fold', 0, 99) < 35
        ? {
            position: value('fold-position', 0, 100),
            angle: value('fold-angle', 105, 158),
          }
        : null,
  };
}

function createRow(document, track, band) {
  const row = document.createElement('li');
  const entry = document.createElement('div');
  const title = document.createElement('span');
  const ordinal = document.createElement('sup');
  row.className = 'ribbon-setlist__row';
  row.value = track.ordinal;
  row.dataset.ink = band.ink;
  const script = ribbonTitleScript(track.title);
  if (script !== 'default') row.dataset.script = script;
  if (track.current) row.setAttribute('aria-current', 'true');
  entry.className = 'ribbon-setlist__entry';
  title.className = 'ribbon-setlist__title';
  title.dir = 'auto';
  if (script === 'kana') title.lang = 'ja';
  if (script === 'hangul') title.lang = 'ko';
  if (script === 'default') title.textContent = track.title;
  else {
    for (const { text, latin } of ribbonTitleRuns(track.title)) {
      if (latin) {
        const span = document.createElement('span');
        span.className = 'ribbon-setlist__latin';
        span.textContent = text;
        title.append(span);
      } else title.append(text);
    }
  }
  ordinal.className = 'ribbon-setlist__ordinal';
  ordinal.setAttribute('aria-hidden', 'true');
  ordinal.textContent = String(track.ordinal).padStart(2, '0');
  entry.append(title, ordinal);
  row.append(entry);
  row.style.setProperty('--band-start', band.start + 'px');
  row.style.setProperty('--band-trim-top', band.trimTop + 'px');
  row.style.setProperty('--band-trim-bottom', band.trimBottom + 'px');
  if (band.fold) {
    row.style.setProperty('--fold-width', '24%');
    row.style.setProperty('--fold-position', band.fold.position + '%');
    row.style.setProperty('--fold-angle', band.fold.angle + 'deg');
  }
  return { row, title, band, track };
}

function exceedsTwoLines(title, window) {
  const lineHeight = parseFloat(window.getComputedStyle(title).lineHeight);
  return title.offsetHeight > 2 * lineHeight + 1;
}

function fitRows(items, window, width) {
  for (const { row, title } of items) {
    delete row.dataset.compact;
    delete title.dataset.truncated;
  }
  const compact = items.filter(({ title }) => exceedsTwoLines(title, window));
  for (const { row } of compact) row.dataset.compact = '';
  const truncated = compact.filter(({ title }) =>
    exceedsTwoLines(title, window),
  );
  for (const { title } of truncated) title.dataset.truncated = '';
  const dimensions = items.map(({ row }) => [
    row.offsetWidth,
    row.offsetHeight,
  ]);
  items.forEach((item, index) => {
    const [rowWidth, height] = dimensions[index];
    item.height = height;
    shapeBand(item, rowWidth, height, width);
  });
}

function shapeBand({ row, band }, rowWidth, height, width) {
  const tail = Math.min(band.tail, width - rowWidth);
  const bandWidth = rowWidth + tail - band.start;
  const tangent = Math.tan((band.tilt * Math.PI) / 180);
  const edgeLimit = 5.3 + (Math.abs(band.tilt) - 2.1) * (1.1 / 1.5);
  const slant = Math.max(-edgeLimit, Math.min(edgeLimit, bandWidth * tangent));
  const lean = (-slant * (height - Math.abs(slant))) / bandWidth;
  row.style.setProperty('--band-tail', tail + 'px');
  row.style.setProperty('--band-slant', slant.toFixed(2) + 'px');
  row.style.setProperty('--band-lean', lean.toFixed(2) + 'px');
}

function createUnroll(document, title) {
  const layer = document.createElement('div');
  const face = document.createElement('div');
  const edge = document.createElement('div');
  layer.className = 'ribbon-unroll';
  layer.setAttribute('aria-hidden', 'true');
  face.className = 'ribbon-unroll__face';
  edge.className = 'ribbon-unroll__edge';
  const fragment = Array.from(title.trim().replace(/\s+/gu, ' ')).slice(0, 8);
  const word = fragment.join('');
  const line = (word + '\u2002').repeat(
    Math.ceil(36 / Math.max(1, fragment.length)),
  );
  for (const style of ['light', 'dark', 'wide']) {
    const print = document.createElement('span');
    print.className = `ribbon-unroll__print ribbon-unroll__print--${style}`;
    print.dir = 'auto';
    print.textContent = `${line}\n${line}\n${line}`;
    face.append(print);
  }
  layer.append(face, edge);
  return layer;
}

// Shared by the Browser Source and the Gallery so both use the same text metrics.
export function createRibbonView(host, { reviewInterval } = {}) {
  const document = host.ownerDocument;
  const window = document.defaultView;
  const root = document.createElement('section');
  root.className = 'ribbon-setlist';
  root.dataset.surface = 'solid';
  function createPage(name) {
    const page = document.createElement('div');
    const list = document.createElement('ol');
    page.className = `ribbon-setlist__page ribbon-setlist__page--${name}`;
    list.className = 'ribbon-setlist__list';
    list.setAttribute('role', 'list');
    list.dataset.ovlLabel = 'setlistLabel';
    list.setAttribute('aria-label', overlayText('setlistLabel'));
    page.append(list);
    root.append(page);
    return { page, list };
  }
  const latest = createPage('latest');
  const archive = createPage('archive');
  const list = latest.list;
  const probe = document.createElement('ol');
  probe.className = 'ribbon-setlist__list ribbon-setlist__list--measure';
  probe.inert = true;
  root.append(probe);
  host.append(root);
  host.hidden = true;

  let enabled = false;
  let active = false;
  let reducedMotion = false;
  let frame = null;
  let painted = '';
  let currentKey = null;
  let currentItem = null;
  let entrance = null;
  let review = OUTPUT_APPEARANCE_DEFAULTS.receiptReview;
  let reviewSeconds = OUTPUT_APPEARANCE_DEFAULTS.receiptReviewInterval;
  let pages = [];
  let layoutSource;
  let retainedPageEnd;

  const flashback = createRibbonFlashback({
    root,
    latest: latest.page,
    archive: archive.page,
    prepare(before) {
      const page = pages
        .slice(0, -1)
        .findLast((items) => items.at(-1).track.ordinal < (before ?? Infinity));
      if (!page) return null;
      archive.list.replaceChildren(...page.map(({ row }) => row));
      return page[0].track.ordinal;
    },
  });

  function resetReview() {
    flashback.reset({
      enabled:
        review === 'on' &&
        enabled &&
        active &&
        !host.hidden &&
        pages.length > 1,
      reduced: reducedMotion,
      interval: reviewInterval ?? reviewSeconds * 1000,
    });
  }

  function measurePages(tracks, source) {
    const first = tracks[0];
    const matchedPage =
      source === layoutSource &&
      pages.find((page) =>
        page.some(
          ({ track }) =>
            track.ordinal === first.ordinal &&
            (track.trackId || track.title) === (first.trackId || first.title),
        ),
      );
    if (!matchedPage) retainedPageEnd = undefined;
    else if (first.ordinal > pages[0][0].track.ordinal) {
      // The bounded history can lose part of its oldest page while the live page fills.
      retainedPageEnd =
        matchedPage === pages.at(-1)
          ? undefined
          : matchedPage.at(-1).track.ordinal;
    }
    layoutSource = source;
    const overlap = parseFloat(
      window.getComputedStyle(probe).getPropertyValue('--ribbon-row-overlap'),
    );
    const items = tracks.map((track) =>
      createRow(document, track, ribbonBandStyle(track, overlap)),
    );
    probe.replaceChildren(...items.map(({ row }) => row));
    fitRows(items, window, probe.clientWidth);
    probe.replaceChildren();
    pages = ribbonPages(items, overlap, retainedPageEnd);
  }

  function settle() {
    if (!entrance) return;
    delete entrance.row.dataset.entering;
    entrance.layer.remove();
    entrance = null;
  }

  function reveal() {
    if (!enabled || !active || reducedMotion || !currentItem || entrance)
      return;
    const { row, title } = currentItem;
    const layer = createUnroll(document, title.textContent);
    entrance = { row, layer };
    layer.addEventListener('animationend', (event) => {
      if (
        event.animationName === 'ribbon-unroll-face' &&
        entrance?.layer === layer
      )
        settle();
    });
    row.dataset.entering = '';
    row.append(layer);
  }

  function scale() {
    const factor = Math.min(
      host.clientWidth / CANVAS_WIDTH,
      host.clientHeight / CANVAS_HEIGHT,
    );
    if (factor > 0) root.style.setProperty('--ribbon-scale', String(factor));
  }
  const observer = new window.ResizeObserver(scale);
  observer.observe(host);

  function render({ refit = false } = {}) {
    const history = frame?.history ?? [];
    const current = frame?.current;
    const playing = current
      ? {
          ...current,
          ordinal: frame.completedCount + 1,
          current: true,
        }
      : null;
    host.hidden = !enabled || (!history.length && !playing);
    if (host.hidden) {
      if (enabled) {
        settle();
        list.replaceChildren();
        archive.list.replaceChildren();
        pages = [];
        retainedPageEnd = undefined;
        layoutSource = undefined;
        currentItem = null;
        currentKey = null;
        painted = '';
      }
      return true;
    }
    scale();
    const signature = JSON.stringify([
      frame?.sourceName,
      history.map(({ ordinal, trackId, title }) => [ordinal, trackId, title]),
      playing,
    ]);
    if (!refit && signature === painted) return false;
    measurePages(
      playing ? [...history, playing] : history,
      JSON.stringify([frame?.sourceName, frame?.countIsComplete]),
    );
    archive.list.replaceChildren();
    const items = pages.at(-1);
    const key = playing
      ? JSON.stringify([playing.ordinal, playing.trackId || playing.title])
      : null;
    const changed = key !== currentKey;
    if (
      playing &&
      !changed &&
      currentItem?.title.textContent === playing.title
    ) {
      items[items.length - 1] = currentItem;
      for (const child of [...list.children]) {
        if (child !== currentItem.row) child.remove();
      }
      list.prepend(...items.slice(0, -1).map(({ row }) => row));
      if (refit) fitRows([currentItem], window, list.clientWidth);
    } else {
      settle();
      currentItem = playing ? items.at(-1) : null;
      list.replaceChildren(...items.map(({ row }) => row));
    }
    currentKey = key;
    painted = signature;
    if (changed) reveal();
    return true;
  }

  return {
    configure(settings) {
      const { surface, receiptReview, receiptReviewInterval } =
        normalizeOutputAppearance(settings, { templateId: 'ribbon-setlist' });
      root.dataset.surface = surface;
      if (review === receiptReview && reviewSeconds === receiptReviewInterval)
        return;
      review = receiptReview;
      reviewSeconds = receiptReviewInterval;
      resetReview();
    },
    setVisible(value) {
      if (enabled === value) return;
      enabled = value;
      if (!value) settle();
      render();
      resetReview();
    },
    setActive(value, { reveal: onActivation = false } = {}) {
      if (active === value) return;
      active = value;
      if (!active) settle();
      else if (onActivation) reveal();
      resetReview();
    },
    setReducedMotion(value) {
      if (reducedMotion === value) return;
      reducedMotion = value;
      if (value) settle();
      resetReview();
    },
    update(value, { settle: recovering = false } = {}) {
      frame = value;
      if (render() || recovering) resetReview();
    },
    refresh() {
      render({ refit: true });
      resetReview();
    },
    destroy() {
      settle();
      flashback.reset();
      observer.disconnect();
      root.remove();
    },
  };
}
