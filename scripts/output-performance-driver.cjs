'use strict';
// Development-only F5 driver: formal Output server, synthetic data, no App IPC.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..'),
  dir = path.resolve(process.argv[2] ?? '');
if (
  path.dirname(dir) !== path.join(root, 'tasks') ||
  !path.basename(dir).startsWith('output-appearance-audit-f5-') ||
  fs.lstatSync(dir).isSymbolicLink()
)
  throw Error('Invalid F5 directory');
app.setPath('userData', path.join(dir, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
// Execute the same server bytes named in this run's frozen source manifest.
const { createOutputServer } = require(
  path.join(dir, 'runtime-inputs/electron/lib/outputServer.js'),
);
const createProbeServer = (options) =>
  createOutputServer({
    ...options,
    overlayRoot: path.join(dir, 'runtime-inputs/overlay'),
    sharedRoot: path.join(dir, 'runtime-inputs/shared'),
    resolveArtworkAsset: (trackId) =>
      trackId === 'probe-track-1001'
        ? path.join(dir, 'synthetic-cover.png')
        : trackId === 'probe-track-1002'
          ? path.join(dir, 'decode-error.png')
          : null,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let report, options, helper, audit, server, publisher;
const windows = new Set();
let windowIndex = 0;
const cancelled = () => fs.existsSync(path.join(dir, 'cancel'));
const check = () => {
  if (cancelled()) throw Error('probe-cancelled');
};
const save = () =>
  fs.writeFileSync(
    path.join(dir, 'report.json'),
    JSON.stringify(report, null, 2),
  );
let revision = 0,
  clockStart = 0,
  workload = 'paused',
  rapid = false,
  offset = 0;
let lastProjection;
let workloadEpoch = 0;
function publish() {
  const elapsedMs = rapid
    ? Math.floor((Date.now() - clockStart) / 250) * 32000
    : Date.now() - clockStart + offset;
  server.setProjectionState(
    helper.createPerformanceProjection({
      state: workload,
      elapsedMs,
      revision: ++revision,
      sourceEpoch: `probe-workload-${workloadEpoch}`,
    }),
  );
}
async function wait(win, expression, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    check();
    if (await win.webContents.executeJavaScript(expression)) return;
    await sleep(50);
  }
  report.failureObservation = await win.webContents.executeJavaScript(
    '({url:location.pathname,visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight},dataset:{...document.documentElement.dataset},text:document.body.innerText.slice(0,800),rootHidden:document.querySelector("#lyrics-overlay")?.hidden})',
  );
  throw Error(`observation-timeout: ${expression.slice(0, 160)}`);
}
function selector(row) {
  return row.kind === 'lyrics'
    ? '#lyrics-overlay'
    : row.kind === 'setlist'
      ? '#setlist-overlay'
      : '#artwork-overlay';
}
async function setMotion(win, value) {
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  });
}
async function createWindow(row, index = 0, faultMode = null) {
  const win = new BrowserWindow({
    width: Math.round(row.captureSize.width * row.zoomFactor),
    height: Math.round(row.captureSize.height * row.zoomFactor),
    x: index === 1 ? 0 : 1440,
    y: index === 2 ? 720 : 0,
    useContentSize: true,
    show: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: faultMode === 'alpha' ? '#00000000' : '#202020',
    transparent: faultMode === 'alpha',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      zoomFactor: row.zoomFactor,
      partition: `f5-probe-${++windowIndex}`,
    },
  });
  windows.add(win);
  const origin = new URL(server.getStatus().httpUrl).origin;
  win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) =>
    cb(false),
  );
  win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
    const u = new URL(details.url);
    const allowed =
      u.origin === origin ||
      (u.protocol === 'ws:' &&
        u.host === new URL(origin).host &&
        u.pathname === '/ws') ||
      details.url === 'about:blank';
    if (!allowed) report.errors.push('blocked-non-probe-resource');
    cb({ cancel: !allowed });
  });
  win.webContents.setAudioMuted(true);
  win.webContents.on('console-message', (event) => {
    if (
      event.level === 'error' &&
      /Uncaught|TypeError|ReferenceError|SyntaxError|Unhandled|ResizeObserver loop/.test(
        event.message,
      )
    )
      report.errors.push(event.message.slice(0, 400));
  });
  win.webContents.on('render-process-gone', () =>
    report.errors.push('render-process-gone'),
  );
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await win.loadURL('about:blank');
  win.webContents.debugger.attach('1.3');
  if (['fonts', 'gsap'].includes(faultMode)) {
    await win.webContents.debugger.sendCommand('Network.enable');
    await win.webContents.debugger.sendCommand('Network.setCacheDisabled', {
      cacheDisabled: true,
    });
    await win.webContents.debugger.sendCommand('Network.setBlockedURLs', {
      urls: [
        faultMode === 'fonts'
          ? '*/shared/assets/fonts/*'
          : '*/overlay/vendor/gsap.min.js',
      ],
    });
  }
  await setMotion(win, 'no-preference');
  const url = `${server.getStatus().httpUrl}/overlay/${row.kind}`;
  const navigationStarted = performance.now();
  await win.loadURL(url);
  win.setContentSize(
    Math.round(row.captureSize.width * row.zoomFactor),
    Math.round(row.captureSize.height * row.zoomFactor),
  );
  win.webContents.setZoomFactor(row.zoomFactor);
  await win.loadURL(url);
  win.restore();
  win.show();
  win.focus();
  win.setContentSize(
    Math.round(row.captureSize.width * row.zoomFactor),
    Math.round(row.captureSize.height * row.zoomFactor),
  );
  await wait(
    win,
    `document.documentElement.dataset.ovlTemplate===${JSON.stringify(row.templateId)}&&document.querySelector(${JSON.stringify(selector(row))})?.hidden===false`,
  );
  const firstObservedMs = performance.now() - navigationStarted;
  await wait(win, 'document.fonts.status==="loaded"');
  return { win, row, firstObservedMs };
}
async function capture(entry, name) {
  const { win, row } = entry;
  win.restore();
  win.show();
  win.focus();
  assert.equal(win.isVisible(), true);
  await win.webContents.executeJavaScript(
    'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
  );
  await sleep(100);
  const img = await win.webContents.capturePage();
  const bytes = img.toPNG();
  fs.writeFileSync(path.join(dir, name + '.png'), bytes);
  const observation = await win.webContents.executeJavaScript(
    `({viewport:{width:innerWidth,height:innerHeight},hidden:document.querySelector(${JSON.stringify(selector(row))}).hidden,template:document.documentElement.dataset.ovlTemplate,motion:matchMedia('(prefers-reduced-motion: reduce)').matches,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),bodyBackground:getComputedStyle(document.body).backgroundImage,dataset:{...document.documentElement.dataset}})`,
  );
  assert.deepEqual(observation.viewport, row.captureSize);
  return {
    file: name + '.png',
    sha256: audit.sha256(bytes),
    dimensions: img.getSize(),
    zoomFactor: row.zoomFactor,
    alpha: helper.summarizeAlpha(img.toBitmap()),
    observation,
  };
}
async function checkText(entry, expected) {
  report.progress = { templateId: entry.row.templateId, expected };
  save();
  try {
    await wait(
      entry.win,
      `(()=>{const r=document.querySelector(${JSON.stringify(selector(entry.row))});if(r.hidden)return false;const copy=r.cloneNode(true);copy.querySelectorAll('rt').forEach(n=>n.remove());return copy.textContent.replace(/\\s/gu,'').includes(${JSON.stringify(expected.replace(/\s/gu, ''))})})()`,
    );
  } catch (error) {
    const actual = await entry.win.webContents.executeJavaScript(
      'document.body.innerText.slice(0,1200)',
    );
    throw Error(`text-not-observed: ${expected}; actual=${actual}`, {
      cause: error,
    });
  }
}
function setScene(
  state,
  positionMs = 5000,
  sourceStatus = 'ready',
  identity = {},
) {
  lastProjection = helper.createPerformanceProjection({
    state,
    elapsedMs: 0,
    positionMs,
    revision: ++revision,
    sourceStatus,
    ...identity,
  });
  server.setProjectionState(lastProjection);
}
async function integration(plan) {
  const ordered = [
    'queue-board',
    'karaoke-stack',
    'art-card',
    'kinetic-pop',
    'ornate-vertical',
    'live-stage',
    'manga-frame',
    'cover-player',
  ];
  for (const id of ordered) {
    check();
    const row = plan.cases.find((r) => r.templateId === id);
    server.setOverlaySlots({
      [row.kind]: { templateId: id, settings: row.settings },
    });
    setScene('paused');
    const entry = await createWindow(row);
    const checks = [];
    const captures = [];
    await checkText(
      entry,
      helper.probeExpectedText(row, lastProjection.snapshot),
    );
    checks.push('initial-canonical-content');
    for (const [label, position] of [
      ['seek-forward', 18000],
      ['seek-backward', 1000],
    ]) {
      setScene('paused', position);
      await checkText(
        entry,
        helper.probeExpectedText(row, lastProjection.snapshot),
      );
      checks.push(label);
    }
    for (let i = 1; i <= 5; i++)
      server.setProjectionState(
        helper.createPerformanceProjection({
          state: 'paused',
          elapsedMs: i * 32000,
          revision: ++revision,
        }),
      );
    await checkText(
      entry,
      row.kind === 'lyrics' ? '合成確認5' : '合成測試曲 5',
    );
    checks.push('rapid-latest-track');
    setScene('paused', 5000, 'unavailable');
    await wait(
      entry.win,
      `document.querySelector(${JSON.stringify(selector(row))}).hidden===true`,
    );
    checks.push('unavailable-clears');
    setScene('paused', 5000, 'ready', {
      bootId: 'probe-new-boot',
      sourceEpoch: 'probe-new-epoch',
    });
    await checkText(
      entry,
      helper.probeExpectedText(row, lastProjection.snapshot),
    );
    checks.push('new-identity-recovers');
    await setMotion(entry.win, 'reduce');
    await wait(
      entry.win,
      "matchMedia('(prefers-reduced-motion: reduce)').matches",
    );
    captures.push(await capture(entry, `${id}-reduced`));
    await setMotion(entry.win, 'no-preference');
    checks.push('native-motion-toggle');
    for (const [label, css] of [
      ['light', '#f4efe6'],
      ['dark', '#202020'],
      [
        'complex',
        'repeating-linear-gradient(35deg, #38444c 0 30px, #ddd4c6 30px 60px)',
      ],
    ]) {
      // Test background only, behind transparent output; no template CSS or artwork edits.
      await entry.win.webContents.executeJavaScript(
        `document.body.style.background=${JSON.stringify(css)}`,
      );
      captures.push(await capture(entry, `${id}-${label}`));
    }
    const alphaEntry = await createWindow(row, 0, 'alpha');
    captures.push(await capture(alphaEntry, `${id}-electron-alpha`));
    alphaEntry.win.destroy();
    windows.delete(alphaEntry.win);
    checks.push('electron-alpha-recorded-not-obs');
    const gsapEntry = await createWindow(row, 0, 'gsap');
    assert.equal(
      await gsapEntry.win.webContents.executeJavaScript('Boolean(window.gsap)'),
      false,
    );
    await checkText(
      gsapEntry,
      helper.probeExpectedText(row, lastProjection.snapshot),
    );
    captures.push(await capture(gsapEntry, `${id}-no-gsap`));
    gsapEntry.win.destroy();
    windows.delete(gsapEntry.win);
    checks.push('gsap-blocked-content-readable');
    if (
      [
        'karaoke-stack',
        'kinetic-pop',
        'ornate-vertical',
        'manga-frame',
      ].includes(id)
    ) {
      const fontEntry = await createWindow(row, 0, 'fonts');
      await checkText(
        fontEntry,
        helper.probeExpectedText(row, lastProjection.snapshot),
      );
      const image = await capture(fontEntry, `${id}-bundled-font-error`);
      assert.ok(image.observation.fonts.some((f) => f.status === 'error'));
      captures.push(image);
      fontEntry.win.destroy();
      windows.delete(fontEntry.win);
      checks.push('bundled-font-blocked-content-readable');
    }
    if (id === 'art-card') {
      await setMotion(entry.win, 'reduce');
      for (const [track, label, valid] of [
        [1001, 'synthetic-cover', true],
        [1002, 'decode-error', false],
      ]) {
        server.setProjectionState(
          helper.createPerformanceProjection({
            state: 'paused',
            elapsedMs: track * 32000,
            revision: ++revision,
          }),
        );
        await checkText(entry, `合成測試曲 ${track}`);
        await wait(
          entry.win,
          `document.querySelector('#artwork-image').dataset.trackId==='probe-track-${track}'&&document.querySelector('#artwork-image').complete&&(document.querySelector('#artwork-image').naturalWidth>0)===${valid}&&document.querySelector('#artwork-image').hidden===${!valid}&&document.querySelector('#artwork-fallback').hidden===${valid}`,
        );
        captures.push(await capture(entry, `${id}-${label}`));
        checks.push(label);
      }
    }
    if (id === 'live-stage') {
      server.setOverlaySlots({
        [row.kind]: {
          templateId: id,
          settings: {
            ...row.settings,
            fontFamily: {
              source: 'local',
              family: 'Utawakui F5 Missing Font 91e58f',
              postscriptName: 'UtawakuiF5MissingFont91e58f',
              style: 'Regular',
            },
          },
        },
      });
      await wait(
        entry.win,
        'document.documentElement.dataset.ovlFont==="local"',
      );
      await checkText(
        entry,
        helper.probeExpectedText(row, lastProjection.snapshot),
      );
      captures.push(await capture(entry, `${id}-local-font-fallback`));
      checks.push('missing-local-font-readable');
    }
    const port = server.getStatus().port;
    await server.stop();
    await sleep(400);
    server = createProbeServer({ port });
    server.setOverlaySlots({
      [row.kind]: { templateId: id, settings: row.settings },
    });
    server.setProjectionState(
      helper.createPerformanceProjection({
        state: 'paused',
        elapsedMs: 64000,
        revision: 1,
        bootId: 'probe-restart-boot',
        sourceEpoch: 'probe-restart-epoch',
      }),
    );
    await server.start();
    await checkText(
      entry,
      row.kind === 'lyrics' ? '合成確認2' : '合成測試曲 2',
    );
    assert.equal(server.getStatus().clients, 1);
    checks.push('socket-server-restart-recovers');
    report.checks.push({
      templateId: id,
      status: 'passed',
      checks,
      captures,
      firstObservedMs: entry.firstObservedMs,
      settings: row.settings,
      sourceStatus: server.getStatus().clients,
    });
    save();
    entry.win.destroy();
    windows.delete(entry.win);
  }
}
async function sampleWindow(label, entries, durationMs, warmupMs) {
  app.getAppMetrics();
  await sleep(1000);
  const start = Date.now(),
    samples = [];
  while (Date.now() - start < durationMs) {
    check();
    const sample = {
      elapsedMs: Date.now() - start,
      ...helper.readMetrics(app.getAppMetrics(), server.getStatus()),
    };
    samples.push(sample);
    fs.appendFileSync(
      path.join(dir, 'samples.jsonl'),
      JSON.stringify({ label, ...sample }) + '\n',
    );
    report.progress = { label, elapsedMs: sample.elapsedMs, latest: sample };
    save();
    await sleep(Math.min(5000, durationMs - (Date.now() - start)));
  }
  for (const e of entries) assert.equal(e.win.isVisible(), true);
  const record = {
    label,
    durationMs: Date.now() - start,
    sampleIntervalMs: 5000,
    summary: helper.summarizeSamples(samples, warmupMs),
    lastDelivery: server.getStatus().delivery,
  };
  report.samples.push(record);
  save();
  return record;
}
async function performanceRuns(plan) {
  const defaults = ['queue-board', 'karaoke-stack', 'art-card'];
  const selections =
    options.mode === 'soak'
      ? [defaults]
      : options.templates
        ? [options.templates]
        : [
            ...defaults.map((id) => [id]),
            ...plan.cases
              .filter((r) => !defaults.includes(r.templateId))
              .map((r) => [r.templateId]),
            defaults,
          ];
  for (const selection of selections) {
    const rows = selection.map((id) =>
      plan.cases.find((r) => r.templateId === id),
    );
    server.setOverlaySlots(
      Object.fromEntries(
        rows.map((row) => [
          row.kind,
          { templateId: row.templateId, settings: row.settings },
        ]),
      ),
    );
    workload = 'playing';
    workloadEpoch++;
    clockStart = Date.now();
    offset = 5000;
    rapid = false;
    publish();
    const entries = [];
    for (let i = 0; i < rows.length; i++)
      entries.push(await createWindow(rows[i], i));
    publisher = setInterval(() => {
      try {
        publish();
      } catch (e) {
        report.errors.push(e.message);
      }
    }, 250);
    if (options.mode === 'soak')
      await sampleWindow(
        `defaults-playing-${options.minutes}min`,
        entries,
        options.minutes * 60000,
        60000,
      );
    else {
      for (const state of ['playing', 'paused', 'empty', 'rapid']) {
        workload = state === 'rapid' ? 'playing' : state;
        workloadEpoch++;
        rapid = state === 'rapid';
        clockStart = Date.now();
        publish();
        await sampleWindow(
          `${selection.join('+')}:${state}`,
          entries,
          selection.length === 3 ? 30000 : 10000,
          selection.length === 3 ? 10000 : 5000,
        );
      }
    }
    clearInterval(publisher);
    publisher = null;
    for (const e of entries) {
      report.checks.push({
        templateId: e.row.templateId,
        status: 'passed',
        label: options.mode,
        firstObservedMs: e.firstObservedMs,
        settings: e.row.settings,
        capture: await capture(
          e,
          `${selection.join('_')}-${e.row.templateId}-${options.mode}`,
        ),
      });
      e.win.destroy();
      windows.delete(e.win);
    }
  }
}
(async () => {
  audit = await import(
    pathToFileURL(path.join(__dirname, 'outputAppearanceAudit.mjs')).href
  );
  helper = await import(
    pathToFileURL(path.join(__dirname, 'outputPerformanceProbe.mjs')).href
  );
  report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
  options = helper.parseProbeArguments(
    Object.entries(report.options).flatMap(([key, value]) => [
      key === 'templates' ? '--template' : '--' + key,
      String(value),
    ]),
  );
  check();
  await app.whenReady();
  report.versions = {
    app: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    windows: os.release(),
    logicalCpuCount: os.cpus().length,
    totalMemoryMiB: Math.round(os.totalmem() / 1024 ** 2),
    obs: 'not-tested',
  };
  report.gpu = {
    features: app.getGPUFeatureStatus(),
    basic: await app.getGPUInfo('basic'),
    vram: 'not-measured',
  };
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 80;
    pixels[i + 1] = (i / 4) % 2 ? 170 : 50;
    pixels[i + 2] = 210;
    pixels[i + 3] = 255;
  }
  fs.writeFileSync(
    path.join(dir, 'synthetic-cover.png'),
    nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }).toPNG(),
  );
  fs.writeFileSync(
    path.join(dir, 'decode-error.png'),
    'self-authored intentionally invalid PNG',
  );
  report.limits = [
    'Synthetic Output-only Electron workload; no actual App player, audio, private library or OBS process measured.',
    'Lyrics CSS1920x1080 at zoom0.75; widgets zoom1. CPU is sum of Electron-reported process percentCPUUsage; working sets in KiB.',
    'GPU-process RAM is not GPU VRAM. No FPS, no whole-system resource claim, no performance budget.',
    'Occluded-window backgrounding disabled explicitly; captures may overlap. Static and temporal checks do not certify complete artistic animation fidelity.',
  ];
  server = createProbeServer({ port: 0 });
  await server.start();
  report.resourcesBeforeWindows = {
    at: new Date().toISOString(),
    ...helper.readMetrics(app.getAppMetrics(), server.getStatus()),
  };
  const origin = new URL(server.getStatus().httpUrl).origin;
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) =>
    cb(false),
  );
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const u = new URL(details.url);
    const allowed =
      u.origin === origin ||
      (u.protocol === 'ws:' &&
        u.host === new URL(origin).host &&
        u.pathname === '/ws') ||
      details.url === 'about:blank';
    if (!allowed) report.errors.push('blocked-non-probe-resource');
    cb({ cancel: !allowed });
  });
  const plan = audit.buildAuditPlan();
  const kinds = options.templates
    ? plan.cases
        .filter((row) => options.templates.includes(row.templateId))
        .map((row) => row.kind)
    : ['lyrics', 'setlist', 'now-playing'];
  report.modulePreflight = await helper.inspectProbeModuleGraph(origin, kinds);
  save();
  if (report.modulePreflight.status !== 'passed')
    throw Error('probe-module-preflight-failed');
  if (options.mode === 'integration') await integration(plan);
  else await performanceRuns(plan);
  const drift = report.source.files
    .filter(
      (f) =>
        ![
          'scripts/outputPerformanceProbe.mjs',
          'scripts/output-performance-probe.mjs',
          'scripts/output-performance-driver.cjs',
        ].includes(f.file),
    )
    .filter(
      (f) =>
        audit.sha256(
          fs.readFileSync(path.join(dir, 'runtime-inputs', f.file)),
        ) !== f.sha256,
    );
  if (drift.length) throw Error('runtime-source-changed-during-probe');
  if (report.errors.length) throw Error('probe-observed-errors');
  report.status = 'passed';
})()
  .catch((error) => {
    if (report) {
      report.status = cancelled() ? 'cancelled' : 'failed';
      report.errors.push(String(error.message).slice(0, 500));
    } else console.error(error.stack);
  })
  .finally(async () => {
    clearInterval(publisher);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    if (server) await server.stop();
    if (report) {
      report.finishedAt = new Date().toISOString();
      save();
    }
    app.exit(report?.status === 'passed' ? 0 : 1);
  });
