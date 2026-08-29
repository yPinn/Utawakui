/* global __dirname, console, process, require, setTimeout, URL */

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const prototypeDir = path.resolve(__dirname, '..');
const outputDir = path.join(prototypeDir, 'screenshots');
const captureDataDir = process.env.UTAWAKUI_CAPTURE_USER_DATA;
const entryUrl = pathToFileURL(path.join(prototypeDir, 'index.html'));

if (!captureDataDir) {
  throw new Error('Capture must be started through capture-app/run.js');
}

const variants = [
  {
    name: 'studio-library-dark-1440x810.png',
    width: 1440,
    height: 810,
    theme: 'dark',
    density: 'standard',
  },
  {
    name: 'studio-library-light-1440x810.png',
    width: 1440,
    height: 810,
    theme: 'light',
    density: 'standard',
  },
  {
    name: 'studio-library-dark-960x650.png',
    width: 960,
    height: 650,
    theme: 'dark',
    density: 'compact',
  },
  {
    name: 'studio-library-light-960x650.png',
    width: 960,
    height: 650,
    theme: 'light',
    density: 'compact',
  },
];

let captureInProgress = true;

app.setPath('userData', captureDataDir);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch(
  'disk-cache-dir',
  path.join(captureDataDir, 'Cache'),
);

async function waitForStablePaint(window) {
  await window.webContents.executeJavaScript('document.fonts.ready');
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function verifyInteractions(window) {
  return window.webContents.executeJavaScript(`(() => {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const body = document.body;
    const rows = [...document.querySelectorAll('.track-row')];
    const search = document.querySelector('[data-track-search]');
    const ready = document.querySelector('[data-action="toggle-ready"]');
    const play = document.querySelector('[data-action="toggle-play"]');
    const next = document.querySelector('[data-action="next"]');
    const previous = document.querySelector('[data-action="previous"]');
    const repeat = document.querySelector('[data-action="repeat"]');
    const progress = document.querySelector('[data-playback-progress]');
    const playPlaylist = document.querySelector('[data-action="play-playlist"]');
    const queueToggle = document.querySelector('[data-action="queue"]');
    const sidebarToggle = document.querySelector('[data-action="toggle-sidebar"]');

    const nowTitle = () => document.querySelector('[data-now-title]').textContent;
    const openTrackMenu = (row) => {
      row.querySelector('.row-action').dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 200 }),
      );
      return document.querySelector('#track-menu');
    };

    ready.click();
    assert(ready.getAttribute('aria-pressed') === 'true', 'ready filter did not toggle');
    assert(rows.filter((row) => !row.hidden).length === 5, 'ready filter count changed');

    search.value = 'no-result';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    assert(body.dataset.scenario === 'search-empty', 'search-empty state did not activate');
    document.querySelector('[data-action="clear-search"]').click();
    assert(body.dataset.scenario === 'populated', 'search clear did not restore populated state');

    const originalTitle = nowTitle();
    rows[2].click();
    assert(nowTitle() === originalTitle, 'single-click unexpectedly started playback');

    rows[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    assert(nowTitle() === '별빛 리허설', 'double-click did not update playback');

    rows[1].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    assert(nowTitle() === '夜明けのアーカイブ', 'keyboard playback did not update');
    assert(rows[1].getAttribute('aria-current') === 'true', 'playing row state was not exposed');

    search.value = '별빛 리허설';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    rows[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    next.click();
    assert(
      nowTitle() === rows[3].dataset.title,
      'filter replaced the authored playback context',
    );
    document.querySelector('[data-action="clear-search"]').click();

    repeat.click();
    assert(repeat.dataset.repeatMode === 'context', 'repeat did not enter context mode');
    repeat.click();
    assert(repeat.dataset.repeatMode === 'track', 'repeat did not enter track mode');
    repeat.click();
    assert(repeat.dataset.repeatMode === 'off', 'repeat did not return to off mode');

    rows.at(-1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    document.dispatchEvent(new Event('prototype:track-ended'));
    assert(nowTitle() === rows.at(-1).dataset.title, 'sequence end wrapped to the first track');
    assert(play.getAttribute('aria-label') === '播放', 'sequence end did not stop playback');

    rows[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    next.click();
    progress.value = '45';
    progress.dispatchEvent(new Event('input', { bubbles: true }));
    previous.click();
    assert(nowTitle() === rows[2].dataset.title, 'Previous skipped despite elapsed threshold');
    assert(progress.value === '0', 'Previous did not restart the current track');
    previous.click();
    assert(nowTitle() === rows[1].dataset.title, 'Previous did not return to playback history near the start');

    let menu = openTrackMenu(rows[4]);
    menu.querySelector('[data-menu-action="queue"]').click();
    menu = openTrackMenu(rows[4]);
    menu.querySelector('[data-menu-action="queue"]').click();
    queueToggle.click();
    assert(
      document.querySelectorAll('[data-queue-entry]').length === 2,
      'queue did not preserve duplicate entries',
    );
    next.click();
    assert(nowTitle() === rows[4].dataset.title, 'manual queue did not take priority');
    assert(
      document.querySelectorAll('[data-queue-entry]').length === 1,
      'manual queue did not consume one unique entry',
    );
    progress.value = '27';
    progress.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-queue-current]').click();
    assert(progress.value === '27', 'current queue row restarted playback');

    search.value = rows[4].dataset.title;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    playPlaylist.click();
    assert(nowTitle() === rows[0].dataset.title, 'Play playlist used the filtered first row');
    assert(
      document.querySelectorAll('[data-queue-entry]').length === 0,
      'starting a new source retained the previous manual queue',
    );
    document.querySelector('[data-action="clear-search"]').click();

    sidebarToggle.click();
    assert(body.classList.contains('is-sidebar-collapsed'), 'sidebar did not collapse explicitly');
    sidebarToggle.click();
    assert(!body.classList.contains('is-sidebar-collapsed'), 'sidebar did not expand explicitly');

    document.querySelector('[data-action="open-details"]').click();
    const dialog = document.querySelector('.details-dialog');
    assert(dialog.open, 'details dialog did not open');
    dialog.close('cancel');

    menu = openTrackMenu(rows[1]);
    assert(menu.matches(':popover-open'), 'track popover did not open');
    menu.hidePopover();

    const labWasHidden = body.classList.contains('is-lab-hidden');
    search.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'h' }));
    assert(body.classList.contains('is-lab-hidden') === labWasHidden, 'typing H changed lab visibility');

    return true;
  })()`);
}

async function verifyZoomReflow(window) {
  for (const zoomFactor of [1.25, 2]) {
    window.webContents.setZoomFactor(zoomFactor);
    await waitForStablePaint(window);
    const result = await window.webContents.executeJavaScript(`(() => {
      const root = document.documentElement;
      const workspace = document.querySelector('.workspace').getBoundingClientRect();
      const player = document.querySelector('.player-bar').getBoundingClientRect();
      const trackDocument = document.querySelector('.track-document');
      return {
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        verticalOverflow: root.scrollHeight - root.clientHeight,
        workspaceRight: workspace.right,
        playerBottom: player.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        trackDocumentHeight: trackDocument.clientHeight,
      };
    })()`);
    if (
      result.horizontalOverflow > 1 ||
      result.verticalOverflow > 1 ||
      result.workspaceRight > result.viewportWidth + 1 ||
      result.playerBottom > result.viewportHeight + 1 ||
      result.trackDocumentHeight <= 0
    ) {
      throw new Error(
        `zoom ${zoomFactor} reflow failed: ${JSON.stringify(result)}`,
      );
    }
    console.log(`verified ${zoomFactor * 100}% zoom reflow`);
  }
  window.webContents.setZoomFactor(1);
}

async function captureVariant(variant) {
  const window = new BrowserWindow({
    width: variant.width,
    height: variant.height,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: variant.theme === 'light' ? '#e8e4dd' : '#191a1e',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      paintWhenInitiallyHidden: true,
      sandbox: true,
    },
  });

  const url = new URL(entryUrl.href);
  url.searchParams.set('clean', '1');
  url.searchParams.set('theme', variant.theme);
  url.searchParams.set('density', variant.density);
  url.searchParams.set('motion', 'reduced');
  url.searchParams.set('scenario', 'populated');

  await window.loadURL(url.href);
  window.webContents.setZoomFactor(1);
  await waitForStablePaint(window);
  const image = await window.webContents.capturePage();
  const outputPath = path.join(outputDir, variant.name);
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`captured ${outputPath}`);
  if (variant === variants[0]) {
    await verifyInteractions(window);
    console.log(
      'verified prototype filters, context playback, repeat, queue, sidebar, dialog, and popover',
    );
  }
  if (variant.width === 960 && variant.theme === 'light') {
    await verifyZoomReflow(window);
  }
  window.destroy();
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    for (const variant of variants) await captureVariant(variant);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    captureInProgress = false;
    console.log(`UTAWAKUI_CAPTURE_COMPLETE:${process.exitCode ?? 0}`);
  }
});

app.on('window-all-closed', () => {
  if (!captureInProgress) app.quit();
});
