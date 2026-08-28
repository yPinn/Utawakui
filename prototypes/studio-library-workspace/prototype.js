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
const nowTitle = document.querySelector('[data-now-title]');
const nowArtist = document.querySelector('[data-now-artist]');

let readyOnly = false;
let toastTimer = null;

function iconUse(button, icon) {
  const use = button.querySelector('use');
  if (use) use.setAttribute('href', `#icon-${icon}`);
}

function setTheme(value) {
  root.dataset.uiTheme = value;
  document.querySelector('[data-control="theme"]').value = value;
}

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
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2400);
}

function rowCopy(row) {
  const artist = row.querySelector('.track-identity small');
  return {
    title: row.querySelector('.track-identity strong')?.textContent ?? '',
    artist: artist?.textContent ?? '',
    artistLang: artist?.lang || 'zh-Hant',
  };
}

function selectRow(row) {
  rows.forEach((item) => {
    const selected = item === row;
    item.classList.toggle('is-selected', selected);
    const playing = item.classList.contains('is-playing');
    const states = [playing ? '正在播放' : '', selected ? '已選取' : ''].filter(
      Boolean,
    );
    item.setAttribute(
      'aria-label',
      `${item.dataset.title}${states.length ? `，${states.join('，')}` : ''}`,
    );
  });
}

function playRow(row) {
  rows.forEach((item) => {
    const playing = item === row;
    item.classList.toggle('is-playing', playing);
    if (playing) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });
  const copy = rowCopy(row);
  nowTitle.textContent = copy.title;
  nowTitle.lang = row.dataset.lang ?? 'zh-Hant';
  nowArtist.textContent = copy.artist;
  nowArtist.lang = copy.artistLang;
  playButton.setAttribute('aria-label', '暫停');
  iconUse(playButton, 'pause');
  selectRow(row);
}

function visibleRows() {
  return rows.filter((row) => !row.hidden);
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
  const x = Math.min(anchorX, window.innerWidth - 208);
  const y = Math.min(anchorY, window.innerHeight - 160);
  trackMenu.style.left = `${x}px`;
  trackMenu.style.top = `${y}px`;
  trackMenu.showPopover();
}

function cycleTrack(direction) {
  const available = visibleRows();
  if (!available.length) return;
  const current = available.findIndex((row) =>
    row.classList.contains('is-playing'),
  );
  const nextIndex = (current + direction + available.length) % available.length;
  playRow(available[nextIndex]);
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
  .addEventListener('click', () => {
    body.classList.add('is-lab-hidden');
  });

document
  .querySelector('[data-action="show-lab"]')
  .addEventListener('click', () => {
    body.classList.remove('is-lab-hidden');
  });

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

  row.addEventListener('dblclick', () => playRow(row));
  row.addEventListener('keydown', (event) => {
    if (event.target.closest('.row-action')) return;
    if (event.key === 'Enter') playRow(row);
    if (event.key === ' ') {
      event.preventDefault();
      selectRow(row);
    }
  });
});

trackMenu.querySelectorAll('[data-menu-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const label = button.textContent.trim();
    showToast(`${trackMenu.dataset.trackTitle}：${label}`);
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
  .addEventListener('click', () => {
    dialog.showModal();
  });

dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'save') showToast('播放清單資料已更新（demo）');
});

document
  .querySelector('[data-action="play-playlist"]')
  .addEventListener('click', () => {
    const first = visibleRows()[0];
    if (first) playRow(first);
  });

playButton.addEventListener('click', () => {
  const isPaused = playButton.getAttribute('aria-label') === '播放';
  playButton.setAttribute('aria-label', isPaused ? '暫停' : '播放');
  iconUse(playButton, isPaused ? 'pause' : 'play');
});

document
  .querySelector('[data-action="previous"]')
  .addEventListener('click', () => cycleTrack(-1));
document
  .querySelector('[data-action="next"]')
  .addEventListener('click', () => cycleTrack(1));

['shuffle', 'repeat'].forEach((action) => {
  const button = document.querySelector(`[data-action="${action}"]`);
  button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', String(!active));
  });
});

document.querySelectorAll('.playlist-row').forEach((button) => {
  button.addEventListener('click', () => {
    updateWorkspace(button.dataset.playlist, button.dataset.meta, button);
  });
});

document.querySelectorAll('.sidebar-row').forEach((button) => {
  button.addEventListener('click', () => {
    updateWorkspace(button.dataset.library, '42 首曲目', button);
  });
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
    showToast('曲目順序已反轉（demo）');
  });

document.querySelectorAll('.player-extras .icon-button').forEach((button) => {
  button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', String(!active));
    showToast(`${button.getAttribute('aria-label')}面板（demo）`);
  });
});

document.addEventListener('keydown', (event) => {
  const editing = event.target.closest?.(
    'input, textarea, select, [contenteditable="true"]',
  );
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

if (params.get('clean') === '1') {
  body.classList.add('is-clean', 'is-lab-hidden');
}
