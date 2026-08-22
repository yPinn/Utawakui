import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { selectSetlistFrame } from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  sourceName: 'Setlist',
  rows: [
    { state: 'played', title: 'Stellar Stellar', artist: '星街すいせい' },
    { state: 'current', title: '怪物', artist: 'YOASOBI' },
    { state: 'queued', title: '群青', artist: 'YOASOBI' },
  ],
});

function renderRows(container, rows) {
  container.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');
      const track = document.createElement('span');
      const artist = document.createElement('span');
      item.className = `setlist-overlay__row is-${row.state}`;
      track.className = 'setlist-overlay__track';
      artist.className = 'setlist-overlay__artist';
      track.textContent = row.title;
      artist.textContent = row.artist ? ` · ${row.artist}` : '';
      track.append(artist);
      item.append(track);
      return item;
    }),
  );
}

function boot() {
  const root = document.querySelector('#setlist-overlay');
  const title = document.querySelector('#setlist-title');
  const rows = document.querySelector('#setlist-rows');
  if (!root || !title || !rows) return;

  const previewMode = isPreviewMode(window.location);
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, previewMode);
  if (previewMode) {
    root.hidden = false;
    title.textContent = PREVIEW_FRAME.sourceName;
    renderRows(rows, PREVIEW_FRAME.rows);
  }

  const connection = createOverlayConnection({
    kind: 'setlist',
    onConfig: (slot) => applyOverlayAppearance(document, slot),
    onSnapshot: (snapshot) => {
      const frame = withPreviewFallback(
        selectSetlistFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      root.hidden = !frame.visible;
      root.dataset.revision = String(frame.revision);
      title.textContent = frame.sourceName;
      renderRows(rows, frame.rows);
    },
  });
  connection.start();
  window.addEventListener('pagehide', () => connection.stop(), { once: true });
}

if (typeof document !== 'undefined') boot();
