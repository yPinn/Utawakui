/* global document, ResizeObserver, URLSearchParams, window */

import {
  receiptHistoryAdvanced,
  receiptPageLayout,
  receiptRows,
  selectReceiptSetlistFrame,
} from '../../shared/presentation/receiptSetlist.mjs';

const params = new URLSearchParams(window.location.search);
const backdrop = params.get('backdrop');
if (['dark', 'light', 'checker'].includes(backdrop))
  document.documentElement.dataset.overlayBackdrop = backdrop;

const sample = params.get('sample');
const completed = [
  ['最後一頁', '晚風社'],
  ['Blue Hour', 'Quiet Relay'],
  ['雨停以前', '晚風社'],
  ['City of Afterglow', 'Quiet Relay'],
  ['夜車離站', '灰藍樂隊'],
  ['海岸線以北', '紙月電台'],
].map(([title, artist], index) => ({
  ordinal: index + 1,
  track: { id: `completed-${index + 1}`, title, artist },
}));
const current = {
  id: 'nightfall',
  title: '夜色落幕之前',
  artist: '紙月電台',
};
const following = { id: 'letters', title: '寄不出的信', artist: '晚風社' };
if (sample === 'long') {
  completed[4].track.title = '雨停以前還有一整座城市的燈等著天亮';
  current.title = '把還沒說完的話留在最後一班開往海邊的列車上';
}

function frameFor(song, history) {
  return selectReceiptSetlistFrame({
    queue: {
      sourceName: '深夜練唱室',
      items: song ? [{ state: 'current', track: song }] : [],
      receipt: { completedCount: history.length, history },
    },
  });
}

const root = document.querySelector('.typewriter-setlist');
const printArea = root.querySelector('.typewriter-setlist__print-area');
const viewport = root.querySelector('.typewriter-setlist__viewport');
const list = document.getElementById('printed-tracks');
const clip = document.getElementById('current-clip');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let displayed = null;
let feed = null;

function printRow(track, isCurrent = false) {
  const row = document.createElement('li');
  const position = document.createElement('span');
  const title = document.createElement('strong');
  const artist = document.createElement('span');
  row.dataset.ordinal = String(track.ordinal);
  row.dataset.trackId = track.trackId;
  if (isCurrent) row.setAttribute('aria-current', 'true');
  position.className = 'typewriter-setlist__position';
  position.setAttribute('aria-hidden', 'true');
  position.textContent = String(track.ordinal).padStart(2, '0');
  title.className = 'typewriter-setlist__track';
  title.textContent = track.title;
  title.dir = 'auto';
  artist.className = 'typewriter-setlist__artist';
  artist.textContent = track.artist;
  artist.dir = 'auto';
  row.append(position, title, artist);
  return row;
}

function fitPrintArea() {
  const heights = Array.from(
    list.children,
    (row) => row.getBoundingClientRect().height,
  );
  const [page] = receiptPageLayout(heights, printArea.clientHeight, 'up');
  viewport.style.blockSize = `${page.height}px`;
  if (!clip.hidden)
    clip.style.setProperty('--clip-offset', `${heights.at(-1) / 2}px`);
}

function render(frame) {
  const previousLast = list.lastElementChild;
  const previousTop = previousLast?.getBoundingClientRect().top;
  feed?.cancel();
  root.dataset.feed = 'settled';
  root.hidden = !frame.visible;
  clip.hidden = !frame.current;
  document.getElementById('setlist-source').textContent = frame.sourceName;

  const rows = receiptRows(frame, 'up').map((track) => printRow(track));
  if (frame.current) {
    rows.push(
      printRow({ ...frame.current, ordinal: frame.completedCount + 1 }, true),
    );
  }
  list.replaceChildren(...rows);
  fitPrintArea();

  const advanced = frame.current && receiptHistoryAdvanced(displayed, frame);
  const startedAfterPause =
    frame.current &&
    displayed &&
    !displayed.current &&
    displayed.history.length &&
    displayed.completedCount === frame.completedCount;
  displayed = frame;
  if (
    (!advanced && !startedAfterPause) ||
    !previousLast ||
    reducedMotion.matches
  )
    return;

  const retained = rows.find(
    ({ dataset }) =>
      dataset.ordinal === previousLast.dataset.ordinal &&
      dataset.trackId === previousLast.dataset.trackId,
  );
  const distance = previousTop - retained?.getBoundingClientRect().top;
  if (!(distance > 0)) return;

  // Keep the last printed row at its former position as the new line enters below it.
  root.dataset.feed = 'printing';
  feed = list.animate(
    [
      { transform: `translateY(${distance}px)` },
      { transform: 'translateY(0)' },
    ],
    { duration: 540, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
  const activeFeed = feed;
  activeFeed.finished.then(
    () => {
      if (activeFeed === feed) root.dataset.feed = 'settled';
    },
    () => {},
  );
}

const after = () =>
  frameFor(following, [
    ...completed,
    {
      ordinal: completed.length + 1,
      track: current,
    },
  ]);
if (sample === 'after') render(after());
else if (sample === 'empty') render(frameFor(null, []));
else if (sample === 'first') render(frameFor(current, []));
else render(frameFor(sample === 'waiting' ? null : current, completed));

new ResizeObserver(fitPrintArea).observe(printArea);

if (sample === 'feed') window.setTimeout(() => render(after()), 1500);
