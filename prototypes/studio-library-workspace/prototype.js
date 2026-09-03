/* global document, URLSearchParams, window */

const root = document.documentElement;
const body = document.body;
const params = new URLSearchParams(window.location.search);
const table = document.querySelector('.track-table--populated');
const rows = [...document.querySelectorAll('.track-row')];
const searchInput = document.querySelector('[data-track-search]');
const readyToggle = document.querySelector('[data-action="toggle-ready"]');
const trackMenu = document.querySelector('#track-menu');
const dialog = document.querySelector('.details-dialog');
const toast = document.querySelector('.prototype-toast');
const playButton = document.querySelector('[data-action="toggle-play"]');
const previousButton = document.querySelector('[data-action="previous"]');
const nextButton = document.querySelector('[data-action="next"]');
const shuffleButton = document.querySelector('[data-action="shuffle"]');
const repeatButton = document.querySelector('[data-action="repeat"]');
const progressInput = document.querySelector('[data-playback-progress]');
const currentTimeLabel = document.querySelector('[data-current-time]');
const durationLabel = document.querySelector('[data-duration]');
const nowTitle = document.querySelector('[data-now-title]');
const nowArtist = document.querySelector('[data-now-artist]');
const queuePanel = document.querySelector('#queue-panel');
const queueToggle = document.querySelector('[data-action="queue"]');
const queueManualList = document.querySelector('[data-queue-manual]');
const queueSourceList = document.querySelector('[data-queue-source]');
const queueEmpty = document.querySelector('[data-queue-empty]');
const queueClear = document.querySelector('[data-action="clear-queue"]');
const queueCurrent = document.querySelector('[data-queue-current]');
const sidebarToggle = document.querySelector('[data-action="toggle-sidebar"]');
const sidebarResizeHandle = document.querySelector(
  '[data-action="resize-sidebar"]',
);
const appShell = document.querySelector('.app-shell');

const REPEAT_MODES = ['off', 'context', 'track'];
const SIDEBAR_WIDTH_MIN = 256;
const SIDEBAR_WIDTH_MAX = 392;
const SIDEBAR_WIDTH_STEP = 16;
const SIDEBAR_MODE_KEY = 'utawakui-prototype-sidebar-mode';
const SIDEBAR_WIDTH_KEY = 'utawakui-prototype-sidebar-width';
const isCleanReview = params.get('clean') === '1';
const isDossierEmbed = params.get('embed') === 'dossier';
const responsiveRail = window.matchMedia('(max-width: 60rem)');
const authoredRows = rows.slice();
const initialRow =
  rows.find((row) => row.classList.contains('is-playing')) ?? rows[0];

const playback = {
  current: initialRow
    ? { row: initialRow, origin: 'source', entryId: null }
    : null,
  sourceCursor: initialRow ?? null,
  sourceRows: authoredRows.slice(),
  sourceTitle: document.querySelector('#workspace-title')?.textContent ?? '',
  history: [],
  queue: [],
  queueSequence: 0,
  repeatMode: 'off',
  shuffle: false,
  isPlaying: Boolean(initialRow),
  currentTime: Number.parseFloat(progressInput.value) || 0,
  duration: Number.parseFloat(progressInput.max) || 0,
};

let selectedRow = initialRow ?? null;
let menuRow = null;
let readyOnly = false;
let toastTimer = null;
let sidebarCollapsed = false;
let sidebarWidth = 272;

function iconUse(button, icon) {
  const use = button.querySelector('use');
  if (use) use.setAttribute('href', `#icon-${icon}`);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setTheme(value) {
  root.dataset.uiTheme = value;
  document.querySelector('[data-control="theme"]').value = value;
}

window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent ||
    event.origin !== window.location.origin ||
    event.data?.type !== 'utawakui-prototype-theme'
  ) {
    return;
  }
  setTheme(event.data.theme === 'light' ? 'light' : 'dark');
});

function setDensity(value) {
  root.dataset.uiDensity = value;
  document.querySelector('[data-control="density"]').value = value;
}

function setMotion(value) {
  if (value === 'reduced') root.dataset.uiMotion = 'reduced';
  else delete root.dataset.uiMotion;
  document.querySelector('[data-control="motion"]').value = value;
}

function setScenario(value) {
  body.dataset.scenario = value;
  document.querySelector('[data-control="scenario"]').value = value;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(
    () => toast.classList.remove('is-visible'),
    2400,
  );
}

function rowCopy(row) {
  const artist = row.querySelector('.track-identity small');
  return {
    title: row.querySelector('.track-identity strong')?.textContent ?? '',
    artist: artist?.textContent ?? '',
    artistLang: artist?.lang || 'zh-Hant',
  };
}

function syncRowStates() {
  rows.forEach((row) => {
    const selected = row === selectedRow;
    const playing = row === playback.current?.row;
    row.classList.toggle('is-selected', selected);
    row.classList.toggle('is-playing', playing);
    if (playing) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
    const states = [playing ? '正在播放' : '', selected ? '已選取' : ''].filter(
      Boolean,
    );
    row.setAttribute(
      'aria-label',
      `${row.dataset.title}${states.length ? `，${states.join('，')}` : ''}`,
    );
  });
}

function selectRow(row) {
  selectedRow = row;
  syncRowStates();
}

function setPlaying(value) {
  playback.isPlaying = Boolean(value && playback.current);
  playButton.setAttribute('aria-label', playback.isPlaying ? '暫停' : '播放');
  iconUse(playButton, playback.isPlaying ? 'pause' : 'play');
  body.dataset.playbackState = playback.isPlaying ? 'playing' : 'paused';
}

function updateProgress(value = playback.currentTime) {
  playback.currentTime = clamp(value, 0, playback.duration);
  progressInput.value = String(playback.currentTime);
  currentTimeLabel.textContent = formatTime(playback.currentTime);
  durationLabel.textContent = formatTime(playback.duration);
}

function sourceUpcomingRows() {
  const cursorIndex = playback.sourceRows.indexOf(playback.sourceCursor);
  if (cursorIndex < 0) return playback.sourceRows.slice();
  return playback.sourceRows.slice(cursorIndex + 1);
}

function sourceNextRow() {
  return sourceUpcomingRows()[0] ?? null;
}

function updateTransportAvailability() {
  const hasTrack = Boolean(playback.current);
  const hasNext = Boolean(
    playback.queue.length > 0 ||
    sourceNextRow() ||
    playback.repeatMode === 'context',
  );
  playButton.disabled = !hasTrack;
  previousButton.disabled = !hasTrack;
  nextButton.disabled = !hasTrack || !hasNext;
  shuffleButton.disabled = playback.sourceRows.length < 2;
  repeatButton.disabled = !hasTrack;
  progressInput.disabled = !hasTrack;
}

function updateNowPlaying() {
  if (!playback.current) return;
  const row = playback.current.row;
  const copy = rowCopy(row);
  nowTitle.textContent = copy.title;
  nowTitle.lang = row.dataset.lang ?? 'zh-Hant';
  nowArtist.textContent = copy.artist;
  nowArtist.lang = copy.artistLang;
  document.querySelector('[data-queue-current-title]').textContent = copy.title;
  document.querySelector('[data-queue-current-artist]').textContent =
    copy.artist;
}

function makeQueueAction(label, icon, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'queue-track__action';
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.innerHTML = `<svg aria-hidden="true"><use href="#icon-${icon}"></use></svg>`;
  button.addEventListener('click', onClick);
  return button;
}

function makeQueueTrack(row, marker) {
  const copy = rowCopy(row);
  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'queue-track__main';
  const position = document.createElement('span');
  position.className = 'queue-track__marker';
  position.setAttribute('aria-hidden', 'true');
  position.textContent = marker;
  const trackCopy = document.createElement('span');
  trackCopy.className = 'queue-track__copy';
  const title = document.createElement('strong');
  title.textContent = copy.title;
  title.lang = row.dataset.lang ?? 'zh-Hant';
  const artist = document.createElement('small');
  artist.textContent = copy.artist;
  artist.lang = copy.artistLang;
  trackCopy.append(title, artist);
  main.append(position, trackCopy);
  return main;
}

function moveQueueEntry(entryId, direction) {
  const index = playback.queue.findIndex((entry) => entry.id === entryId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= playback.queue.length) return;
  const next = playback.queue.slice();
  [next[index], next[target]] = [next[target], next[index]];
  playback.queue = next;
  renderQueue();
}

function removeQueueEntry(entryId) {
  playback.queue = playback.queue.filter((entry) => entry.id !== entryId);
  renderQueue();
  updateTransportAvailability();
}

function renderManualQueue() {
  queueManualList.replaceChildren();
  queueEmpty.hidden = playback.queue.length > 0;
  queueClear.disabled = playback.queue.length === 0;
  playback.queue.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'queue-track';
    item.dataset.queueEntry = entry.id;
    const copy = rowCopy(entry.row);
    const main = makeQueueTrack(entry.row, String(index + 1).padStart(2, '0'));
    main.setAttribute('aria-label', `播放佇列曲目：${copy.title}`);
    main.addEventListener('click', () => playQueuedEntry(entry.id));
    const actions = document.createElement('span');
    actions.className = 'queue-track__actions';
    actions.append(
      makeQueueAction(
        `上移 ${copy.title}`,
        'arrow-up',
        () => moveQueueEntry(entry.id, -1),
        index === 0,
      ),
      makeQueueAction(
        `下移 ${copy.title}`,
        'arrow-down',
        () => moveQueueEntry(entry.id, 1),
        index === playback.queue.length - 1,
      ),
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'queue-track__remove';
    remove.setAttribute('aria-label', `移除 ${copy.title}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeQueueEntry(entry.id));
    actions.append(remove);
    item.append(main, actions);
    queueManualList.append(item);
  });
}

function moveSourceUpcoming(row, direction) {
  const upcoming = sourceUpcomingRows();
  const index = upcoming.indexOf(row);
  const targetRow = upcoming[index + direction];
  if (index < 0 || !targetRow) return;
  const rowIndex = playback.sourceRows.indexOf(row);
  const targetIndex = playback.sourceRows.indexOf(targetRow);
  const next = playback.sourceRows.slice();
  [next[rowIndex], next[targetIndex]] = [next[targetIndex], next[rowIndex]];
  playback.sourceRows = next;
  renderQueue();
  updateTransportAvailability();
}

function renderSourceQueue() {
  const upcoming = sourceUpcomingRows();
  queueSourceList.replaceChildren();
  document.querySelector('[data-queue-source-title]').textContent =
    playback.sourceTitle;
  document.querySelector('[data-queue-context]').textContent =
    `${playback.sourceTitle} · 本次播放`;
  if (upcoming.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'queue-empty queue-empty--source';
    empty.textContent = '來源中沒有下一首';
    queueSourceList.append(empty);
    return;
  }
  upcoming.forEach((row, index) => {
    const item = document.createElement('li');
    item.className = 'queue-track';
    item.dataset.sourceTrack = row.dataset.title;
    const copy = rowCopy(row);
    const main = makeQueueTrack(row, String(index + 1).padStart(2, '0'));
    main.setAttribute('aria-label', `立即播放來源曲目：${copy.title}`);
    main.addEventListener('click', () =>
      playEntry({ row, origin: 'source', entryId: null }),
    );
    const actions = document.createElement('span');
    actions.className = 'queue-track__actions';
    actions.append(
      makeQueueAction(
        `上移 ${copy.title}`,
        'arrow-up',
        () => moveSourceUpcoming(row, -1),
        index === 0,
      ),
      makeQueueAction(
        `下移 ${copy.title}`,
        'arrow-down',
        () => moveSourceUpcoming(row, 1),
        index === upcoming.length - 1,
      ),
    );
    item.append(main, actions);
    queueSourceList.append(item);
  });
}

function renderQueue() {
  renderManualQueue();
  renderSourceQueue();
}

function playEntry(entry, options = {}) {
  const { recordHistory = true, resetTime = true } = options;
  if (recordHistory && playback.current)
    playback.history.push({ ...playback.current });
  playback.current = { ...entry };
  if (entry.origin === 'source') playback.sourceCursor = entry.row;
  if (resetTime) updateProgress(0);
  setPlaying(true);
  selectRow(entry.row);
  updateNowPlaying();
  renderQueue();
  updateTransportAvailability();
}

function startSourceContext(row) {
  playback.sourceRows = authoredRows.slice();
  playback.sourceTitle =
    document.querySelector('#workspace-title')?.textContent ??
    playback.sourceTitle;
  playback.sourceCursor = row;
  playback.history = [];
  playback.queue = [];
  playback.shuffle = false;
  shuffleButton.setAttribute('aria-pressed', 'false');
  playEntry({ row, origin: 'source', entryId: null }, { recordHistory: false });
}

function playQueuedEntry(entryId) {
  const index = playback.queue.findIndex((entry) => entry.id === entryId);
  if (index < 0) return;
  const [entry] = playback.queue.splice(index, 1);
  playEntry({ row: entry.row, origin: 'queue', entryId: entry.id });
}

function enqueueRow(row) {
  playback.queueSequence += 1;
  playback.queue.push({ id: `queue-${playback.queueSequence}`, row });
  renderQueue();
  updateTransportAvailability();
  showToast(`已將「${rowCopy(row).title}」加入佇列`);
}

function playNext(options = {}) {
  const { fromEnded = false } = options;
  const queued = playback.queue.shift();
  if (queued) {
    playEntry({ row: queued.row, origin: 'queue', entryId: queued.id });
    return true;
  }
  const sourceNext = sourceNextRow();
  if (sourceNext) {
    playEntry({ row: sourceNext, origin: 'source', entryId: null });
    return true;
  }
  if (playback.repeatMode === 'context' && playback.sourceRows.length > 0) {
    playback.history = [];
    playEntry(
      { row: playback.sourceRows[0], origin: 'source', entryId: null },
      { recordHistory: false },
    );
    return true;
  }
  if (fromEnded) {
    updateProgress(playback.duration);
    setPlaying(false);
    updateTransportAvailability();
    showToast('本次播放已結束');
  }
  return false;
}

function playPrevious() {
  if (!playback.current) return;
  if (playback.currentTime > 3) {
    updateProgress(0);
    setPlaying(true);
    showToast('已回到本曲開頭');
    return;
  }
  const previous = playback.history.pop();
  if (!previous) {
    updateProgress(0);
    return;
  }
  if (playback.current.origin === 'queue') {
    playback.queue.unshift({
      id: playback.current.entryId ?? `queue-${++playback.queueSequence}`,
      row: playback.current.row,
    });
  }
  playEntry(previous, { recordHistory: false });
}

function handleTrackEnded() {
  if (playback.repeatMode === 'track') {
    updateProgress(0);
    setPlaying(true);
    return;
  }
  playNext({ fromEnded: true });
}

function cycleRepeatMode() {
  const currentIndex = REPEAT_MODES.indexOf(playback.repeatMode);
  playback.repeatMode = REPEAT_MODES[(currentIndex + 1) % REPEAT_MODES.length];
  const labels = {
    off: '開啟清單循環',
    context: '清單循環已開啟，切換為單曲循環',
    track: '單曲循環已開啟，關閉循環',
  };
  repeatButton.dataset.repeatMode = playback.repeatMode;
  repeatButton.setAttribute(
    'aria-pressed',
    String(playback.repeatMode !== 'off'),
  );
  repeatButton.setAttribute('aria-label', labels[playback.repeatMode]);
  updateTransportAvailability();
}

function shuffleRemainingRows() {
  const upcoming = sourceUpcomingRows();
  for (let index = upcoming.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [upcoming[index], upcoming[target]] = [upcoming[target], upcoming[index]];
  }
  const cursorIndex = playback.sourceRows.indexOf(playback.sourceCursor);
  const played =
    cursorIndex >= 0 ? playback.sourceRows.slice(0, cursorIndex + 1) : [];
  playback.sourceRows = [...played, ...upcoming];
}

function toggleShuffle() {
  playback.shuffle = !playback.shuffle;
  shuffleButton.setAttribute('aria-pressed', String(playback.shuffle));
  if (playback.shuffle) {
    shuffleRemainingRows();
    showToast('已隨機排列來源中的後續曲目');
  } else {
    playback.sourceRows = authoredRows.slice();
    showToast('已恢復播放清單順序');
  }
  renderQueue();
  updateTransportAvailability();
}

function applyFilters() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  let matches = 0;
  rows.forEach((row) => {
    const matchesQuery = row.textContent.toLocaleLowerCase().includes(query);
    const matchesReady = !readyOnly || row.dataset.ready === 'true';
    row.hidden = !(matchesQuery && matchesReady);
    if (!row.hidden) matches += 1;
  });
  if (matches === 0 && (query || readyOnly)) setScenario('search-empty');
  else if (body.dataset.scenario === 'search-empty') setScenario('populated');
}

function openTrackMenu(event, row) {
  menuRow = row;
  selectRow(row);
  document
    .querySelectorAll('.row-action')
    .forEach((button) => button.setAttribute('aria-expanded', 'false'));
  event.target.closest('.row-action')?.setAttribute('aria-expanded', 'true');
  trackMenu.dataset.trackTitle = row.dataset.title;
  const trigger = event.target.closest('.row-action');
  const triggerRect = trigger?.getBoundingClientRect();
  const anchorX = event.clientX || triggerRect?.right || 0;
  const anchorY = event.clientY || triggerRect?.bottom || 0;
  trackMenu.style.left = `${Math.min(anchorX, window.innerWidth - 208)}px`;
  trackMenu.style.top = `${Math.min(anchorY, window.innerHeight - 160)}px`;
  trackMenu.showPopover();
}

function updateWorkspace(title, meta, sourceButton) {
  const language = sourceButton.dataset.lang ?? 'zh-Hant';
  const workspaceTitle = document.querySelector('#workspace-title');
  workspaceTitle.textContent = title;
  workspaceTitle.lang = language;
  document.querySelector('.dossier-summary').textContent =
    `${meta} · 上次整理於今天 18:40`;
  const heroLetter = document.querySelector('.cover--hero span');
  const dialogLetter = document.querySelector('.cover--dialog span');
  const detailsTitle = document.querySelector('#details-title');
  const dialogInput = document.querySelector('.dialog-content input');
  heroLetter.textContent = title.trim().charAt(0);
  heroLetter.lang = language;
  dialogLetter.textContent = title.trim().charAt(0);
  dialogLetter.lang = language;
  detailsTitle.textContent = title;
  detailsTitle.lang = language;
  dialogInput.value = title;
  dialogInput.lang = language;
  document.querySelectorAll('.playlist-row, .sidebar-row').forEach((button) => {
    const active = button === sourceButton;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function readSidebarPreference() {
  if (isCleanReview) return;
  try {
    sidebarCollapsed = window.localStorage.getItem(SIDEBAR_MODE_KEY) === 'rail';
    const storedWidth = Number.parseFloat(
      window.localStorage.getItem(SIDEBAR_WIDTH_KEY),
    );
    if (Number.isFinite(storedWidth)) {
      sidebarWidth = clamp(storedWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
    }
  } catch {
    // Storage is optional in the isolated file／Vite prototype.
  }
}

function persistSidebarPreference() {
  if (isCleanReview) return;
  try {
    window.localStorage.setItem(
      SIDEBAR_MODE_KEY,
      sidebarCollapsed ? 'rail' : 'expanded',
    );
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  } catch {
    // The prototype remains usable when storage is unavailable.
  }
}

function applySidebarState() {
  const effectivelyCollapsed = sidebarCollapsed || responsiveRail.matches;
  body.classList.toggle('is-sidebar-collapsed', effectivelyCollapsed);
  appShell.style.setProperty('--prototype-sidebar-width', `${sidebarWidth}px`);
  sidebarToggle.disabled = responsiveRail.matches;
  sidebarToggle.setAttribute('aria-expanded', String(!effectivelyCollapsed));
  sidebarToggle.setAttribute(
    'aria-label',
    responsiveRail.matches
      ? '窄版側邊欄；視窗加寬後可展開'
      : sidebarCollapsed
        ? '展開側邊欄'
        : '收合側邊欄',
  );
  iconUse(
    sidebarToggle,
    effectivelyCollapsed ? 'chevron-right' : 'chevron-left',
  );
  sidebarResizeHandle.setAttribute(
    'aria-valuenow',
    String(Math.round(sidebarWidth)),
  );
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  applySidebarState();
  persistSidebarPreference();
}

function setSidebarWidth(value, persist = false) {
  sidebarWidth = clamp(value, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
  applySidebarState();
  if (persist) persistSidebarPreference();
}

function startSidebarResize(event) {
  if (sidebarCollapsed || event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = sidebarWidth;
  sidebarResizeHandle.setPointerCapture(event.pointerId);
  body.classList.add('is-sidebar-resizing');
  const onMove = (moveEvent) => {
    setSidebarWidth(startWidth + moveEvent.clientX - startX);
  };
  const onUp = () => {
    sidebarResizeHandle.releasePointerCapture(event.pointerId);
    sidebarResizeHandle.removeEventListener('pointermove', onMove);
    sidebarResizeHandle.removeEventListener('pointerup', onUp);
    body.classList.remove('is-sidebar-resizing');
    persistSidebarPreference();
  };
  sidebarResizeHandle.addEventListener('pointermove', onMove);
  sidebarResizeHandle.addEventListener('pointerup', onUp);
}

function openQueue() {
  queuePanel.hidden = false;
  body.classList.add('is-queue-open');
  queueToggle.setAttribute('aria-expanded', 'true');
  renderQueue();
  queuePanel.querySelector('[data-action="close-queue"]').focus();
}

function closeQueue(options = {}) {
  queuePanel.hidden = true;
  body.classList.remove('is-queue-open');
  queueToggle.setAttribute('aria-expanded', 'false');
  if (options.restoreFocus !== false) queueToggle.focus();
}

document.querySelectorAll('[data-control]').forEach((control) => {
  control.addEventListener('change', () => {
    const value = control.value;
    if (control.dataset.control === 'theme') setTheme(value);
    if (control.dataset.control === 'density') setDensity(value);
    if (control.dataset.control === 'motion') setMotion(value);
    if (control.dataset.control === 'scenario') setScenario(value);
  });
});

document
  .querySelector('[data-action="hide-lab"]')
  .addEventListener('click', () => body.classList.add('is-lab-hidden'));
document
  .querySelector('[data-action="show-lab"]')
  .addEventListener('click', () => body.classList.remove('is-lab-hidden'));
searchInput.addEventListener('input', applyFilters);
readyToggle.addEventListener('click', () => {
  readyOnly = !readyOnly;
  readyToggle.setAttribute('aria-pressed', String(readyOnly));
  applyFilters();
});
document
  .querySelector('[data-action="clear-search"]')
  .addEventListener('click', () => {
    searchInput.value = '';
    readyOnly = false;
    readyToggle.setAttribute('aria-pressed', 'false');
    applyFilters();
    searchInput.focus();
  });

rows.forEach((row) => {
  row.addEventListener('click', (event) => {
    if (event.target.closest('.row-action')) openTrackMenu(event, row);
    else selectRow(row);
  });
  row.addEventListener('dblclick', () => startSourceContext(row));
  row.addEventListener('keydown', (event) => {
    if (event.target.closest('.row-action')) return;
    if (event.key === 'Enter') startSourceContext(row);
    if (event.key === ' ') {
      event.preventDefault();
      selectRow(row);
    }
  });
});

trackMenu.querySelectorAll('[data-menu-action]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.menuAction === 'queue' && menuRow) enqueueRow(menuRow);
    else
      showToast(
        `${trackMenu.dataset.trackTitle}：${button.textContent.trim()}`,
      );
    trackMenu.hidePopover();
  });
});
trackMenu.addEventListener('toggle', (event) => {
  if (event.newState === 'closed') {
    document
      .querySelectorAll('.row-action')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }
});

document
  .querySelector('[data-action="open-details"]')
  .addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'save') showToast('播放清單資料已更新（demo）');
});
document
  .querySelector('[data-action="play-playlist"]')
  .addEventListener('click', () => {
    if (authoredRows[0]) startSourceContext(authoredRows[0]);
  });

playButton.addEventListener('click', () => setPlaying(!playback.isPlaying));
previousButton.addEventListener('click', playPrevious);
nextButton.addEventListener('click', () => playNext());
repeatButton.addEventListener('click', cycleRepeatMode);
shuffleButton.addEventListener('click', toggleShuffle);
progressInput.addEventListener('input', () => {
  updateProgress(Number.parseFloat(progressInput.value) || 0);
});
document.addEventListener('prototype:track-ended', handleTrackEnded);

queueToggle.addEventListener('click', () => {
  if (queuePanel.hidden) openQueue();
  else closeQueue();
});
queuePanel
  .querySelector('[data-action="close-queue"]')
  .addEventListener('click', () => closeQueue());
queueClear.addEventListener('click', () => {
  playback.queue = [];
  renderQueue();
  updateTransportAvailability();
  showToast('已清除人工加入的佇列');
});
queueCurrent.addEventListener('click', () => {
  if (!playback.current) return;
  selectRow(playback.current.row);
  showToast(`現正播放：${rowCopy(playback.current.row).title}`);
});

document.querySelectorAll('.playlist-row').forEach((button) => {
  button.addEventListener('click', () =>
    updateWorkspace(button.dataset.playlist, button.dataset.meta, button),
  );
});
document.querySelectorAll('.sidebar-row').forEach((button) => {
  button.addEventListener('click', () =>
    updateWorkspace(button.dataset.library, '42 首曲目', button),
  );
});

document.querySelector('.sidebar-add').addEventListener('click', () => {
  const list = document.querySelector('.sidebar__section--playlists');
  if (list.querySelector('[data-playlist="新播放清單"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'playlist-row';
  button.setAttribute('aria-label', '新播放清單，0 首');
  button.dataset.playlist = '新播放清單';
  button.dataset.meta = '0 首曲目';
  button.innerHTML =
    '<span class="cover cover--paper"><span>新</span></span><span class="playlist-row__copy"><strong>新播放清單</strong><small>播放清單 · 0 首</small></span>';
  button.addEventListener('click', () =>
    updateWorkspace('新播放清單', '0 首曲目', button),
  );
  list.append(button);
  showToast('已建立新播放清單（demo）');
});

sidebarToggle.addEventListener('click', toggleSidebar);
responsiveRail.addEventListener('change', applySidebarState);
sidebarResizeHandle.addEventListener('pointerdown', startSidebarResize);
sidebarResizeHandle.addEventListener('keydown', (event) => {
  if (sidebarCollapsed) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setSidebarWidth(sidebarWidth - SIDEBAR_WIDTH_STEP, true);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    setSidebarWidth(sidebarWidth + SIDEBAR_WIDTH_STEP, true);
  }
  if (event.key === 'Home') {
    event.preventDefault();
    setSidebarWidth(SIDEBAR_WIDTH_MIN, true);
  }
  if (event.key === 'End') {
    event.preventDefault();
    setSidebarWidth(SIDEBAR_WIDTH_MAX, true);
  }
});

document.querySelector('.sidebar-settings').addEventListener('click', () => {
  body.classList.remove('is-lab-hidden');
  showToast('此 demo 以 Workspace Lab 代替設定頁');
});
document
  .querySelector('.scenario-notice--warning button')
  .addEventListener('click', () => {
    setScenario('populated');
    const row = rows.find((item) => item.dataset.ready === 'false');
    if (row) {
      selectRow(row);
      row.focus();
    }
  });
document
  .querySelector('.scenario-notice--error button')
  .addEventListener('click', () => {
    setScenario('populated');
    showToast('曲庫已重新整理（demo）');
  });
document
  .querySelector('.empty-state--empty .button')
  .addEventListener('click', () => {
    setScenario('populated');
    document.querySelector('[data-library="本機曲目"]').click();
  });
document
  .querySelector('[aria-label="曲目排序"]')
  .addEventListener('click', () => {
    rows
      .slice()
      .reverse()
      .forEach((row) => table.append(row));
    showToast('僅反轉畫面排序；本次播放順序不變');
  });
document
  .querySelector('.player-extras [aria-label="歌詞"]')
  .addEventListener('click', (event) => {
    const button = event.currentTarget;
    const active = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', String(!active));
    showToast('歌詞面板（demo）');
  });

document.addEventListener('keydown', (event) => {
  const editing = event.target.closest?.(
    'input, textarea, select, [contenteditable="true"]',
  );
  const key = event.key.toLocaleLowerCase();
  const isFunctionShortcut =
    /^f[1-9]$/u.test(key) && !event.ctrlKey && !event.altKey && !event.metaKey;
  const isArrow = key === 'arrowup' || key === 'arrowdown';
  const isModifiedArrow =
    !editing && isArrow && event.ctrlKey && !event.altKey && !event.metaKey;
  const isPlaybackShortcut =
    !editing &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    (isArrow || key === 'm' || key === 'g');

  if (
    window.parent !== window &&
    (isFunctionShortcut || isModifiedArrow || isPlaybackShortcut)
  ) {
    event.preventDefault();
    window.parent.postMessage(
      {
        type: 'utawakui-app-shortcut',
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      },
      window.location.origin,
    );
    return;
  }
  if (event.key === 'Escape' && !queuePanel.hidden) {
    closeQueue();
    return;
  }
  if (
    !editing &&
    event.key.toLocaleLowerCase() === 'h' &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    body.classList.toggle('is-lab-hidden');
  }
});

setTheme(params.get('theme') === 'light' ? 'light' : 'dark');
setDensity(params.get('density') === 'compact' ? 'compact' : 'standard');
setMotion(params.get('motion') === 'reduced' ? 'reduced' : 'default');
setScenario(params.get('scenario') ?? 'populated');
if (isDossierEmbed) {
  body.classList.add('is-dossier-embed', 'is-clean', 'is-lab-hidden');
} else if (isCleanReview) {
  body.classList.add('is-clean', 'is-lab-hidden');
}

readSidebarPreference();
applySidebarState();
syncRowStates();
updateProgress(playback.currentTime);
setPlaying(playback.isPlaying);
updateNowPlaying();
renderQueue();
updateTransportAvailability();
