'use strict';
// Electron-only development entry. No preload, user library or writable WebSocket.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const dir = path.resolve(process.argv[2] ?? '');
if (
  path.dirname(dir) !== path.join(root, 'tasks') ||
  !path.basename(dir).startsWith('output-appearance-audit-') ||
  fs.lstatSync(dir).isSymbolicLink()
)
  throw Error('Invalid audit directory');
app.setPath('userData', path.join(dir, 'profile'));
app.on('window-all-closed', () => {});
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const { createOutputServer } = require('../electron/lib/outputServer');
let server, win, report, helpers;
const cancelled = () => fs.existsSync(path.join(dir, 'cancel'));
function checkCancellation() {
  if (cancelled()) throw Error('audit-cancelled');
}
async function waitFor(expression) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    checkCancellation();
    if (await win.webContents.executeJavaScript(expression)) return;
    await sleep(50);
  }
  throw Error(`runtime-observation-timeout: ${expression.slice(0, 180)}`);
}
function save() {
  fs.writeFileSync(
    path.join(dir, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}

(async () => {
  helpers = await import(
    pathToFileURL(path.join(__dirname, 'outputAppearanceAudit.mjs')).href
  );
  report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
  assert.deepEqual(
    report.cases,
    helpers.buildAuditPlan(
      JSON.parse(fs.readFileSync(path.join(dir, 'request.json'), 'utf8')),
    ).cases,
  );
  report.versions = {
    ...report.versions,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    windows: process.platform === 'win32' ? os.release() : 'not-applicable',
    platform: process.platform,
  };
  checkCancellation();
  await app.whenReady();
  server = createOutputServer({ port: 0 });
  await server.start();
  const origin = new URL(server.getStatus().httpUrl).origin;
  for (const [index, row] of report.cases.entries()) {
    checkCancellation();
    if (row.captureStatus !== 'pending') continue;
    try {
      server.setOverlaySlots({
        [row.kind]: { templateId: row.templateId, settings: row.settings },
      });
      row.deliveredSlot = server.getOverlayConfig().slots[row.kind];
      assert.deepEqual(row.deliveredSlot, {
        templateId: row.templateId,
        settings: row.settings,
      });
      server.setProjectionState(
        helpers.buildAuditProjection(row.snapshot, row.sourceStatus),
      );
      win = new BrowserWindow({
        width: Math.round(row.captureSize.width * row.zoomFactor),
        height: Math.round(row.captureSize.height * row.zoomFactor),
        useContentSize: true,
        show: true,
        x: 0,
        y: 0,
        backgroundColor: '#202020',
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          zoomFactor: row.zoomFactor,
        },
      });
      win.webContents.setAudioMuted(true);
      const jsErrors = [];
      win.webContents.on('console-message', (event) => {
        if (
          event.level === 'error' &&
          /Uncaught|TypeError|ReferenceError|SyntaxError|Unhandled/.test(
            event.message,
          )
        )
          jsErrors.push(event.message.slice(0, 400));
      });
      win.webContents.on('render-process-gone', () =>
        jsErrors.push('render-process-gone'),
      );
      win.webContents.session.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      win.webContents.session.webRequest.onBeforeRequest(
        (details, callback) => {
          const url = new URL(details.url);
          const allowed =
            url.origin === origin ||
            (url.protocol === 'ws:' &&
              url.host === new URL(origin).host &&
              url.pathname === '/ws') ||
            url.protocol === 'devtools:' ||
            details.url === 'about:blank';
          if (!allowed) jsErrors.push('blocked-non-audit-resource');
          callback({ cancel: !allowed });
        },
      );
      win.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== origin) event.preventDefault();
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      await win.loadURL('about:blank');
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      const url = `${origin}/overlay/${row.kind}`;
      await win.loadURL(url);
      win.webContents.setZoomFactor(row.zoomFactor);
      // Chromium can remember origin zoom from another window. Boot after setting it.
      await win.loadURL(url);
      win.restore();
      win.show();
      win.focus();
      const selector =
        row.kind === 'lyrics'
          ? '#lyrics-overlay'
          : row.kind === 'setlist'
            ? row.templateId === 'receipt-setlist'
              ? '#receipt-host'
              : '#setlist-overlay'
            : '#artwork-overlay';
      await waitFor(
        `document.documentElement.dataset.ovlTemplate===${JSON.stringify(row.templateId)}`,
      );
      const visible = row.sourceStatus === 'ready' && row.expectedFrame.visible;
      await waitFor(
        `document.querySelector(${JSON.stringify(selector)})?.hidden===${!visible}`,
      );
      const expected =
        row.kind === 'lyrics'
          ? row.templateId === 'karaoke-stack'
            ? row.expectedFrame.ktv?.currentText
            : row.templateId === 'kinetic-pop'
              ? row.expectedFrame.kineticPop?.displayText
              : row.expectedFrame.currentText
          : row.kind === 'setlist'
            ? row.expectedFrame.current?.title
            : row.expectedFrame.title;
      if (visible && expected)
        await waitFor(
          `(()=>{const copy=document.querySelector(${JSON.stringify(selector)}).cloneNode(true);copy.querySelectorAll('rt').forEach(n=>n.remove());return copy.textContent.replace(/\\s/gu,'').includes(${JSON.stringify(expected.replace(/\s/gu, ''))})})()`,
        );
      await waitFor('document.fonts.status==="loaded"');
      await sleep(250);
      checkCancellation();
      const observed = await win.webContents.executeJavaScript(
        `({viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,templateId:document.documentElement.dataset.ovlTemplate,settings:{...document.documentElement.dataset},reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:document.querySelector(${JSON.stringify(selector)}).hidden,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),images:[...document.images].map(i=>({complete:i.complete,decoded:i.naturalWidth>0})),background:{html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor},inspectionFlags:{preview:document.documentElement.dataset.overlayPreview??null,workbench:document.documentElement.dataset.overlayWorkbench??null}})`,
      );
      assert.deepEqual(observed.viewport, row.captureSize);
      assert.equal(observed.reducedMotion, true);
      assert.equal(observed.inspectionFlags.preview, null);
      assert.equal(observed.inspectionFlags.workbench, null);
      assert.equal(win.isVisible(), true);
      assert.equal(jsErrors.length, 0, JSON.stringify(jsErrors));
      await win.webContents.executeJavaScript(
        'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
      );
      const capture = await win.webContents.capturePage();
      assert.deepEqual(capture.getSize(), {
        width: Math.round(row.captureSize.width * row.zoomFactor),
        height: Math.round(row.captureSize.height * row.zoomFactor),
      });
      const png = capture.toPNG(),
        bitmap = capture.toBitmap();
      const name = `${String(index + 1).padStart(3, '0')}-${row.templateId}-${row.scenarioId}.png`;
      fs.writeFileSync(path.join(dir, name), png);
      Object.assign(row, {
        captureStatus: 'passed',
        reason: null,
        observed: { ...observed, windowVisible: true, jsErrors },
        capture: {
          file: name,
          sha256: helpers.sha256(png),
          pixelSha256: helpers.sha256(bitmap),
          dimensions: capture.getSize(),
        },
      });
    } catch (error) {
      row.captureStatus = cancelled() ? 'not-tested' : 'failed';
      row.reason = cancelled()
        ? 'cancelled'
        : String(error.message).slice(0, 400);
      if (cancelled()) throw error;
    } finally {
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
      save();
    }
  }
  const after = helpers.collectAuditSources();
  if (JSON.stringify(after) !== JSON.stringify(report.source))
    throw Error('audit-sources-changed-during-run');
  helpers.settleAuditReport(report);
})()
  .catch((error) => {
    if (report) {
      report.errors.push(String(error.message).slice(0, 400));
      helpers.settleAuditReport(report, cancelled() ? 'cancelled' : 'failed');
    } else console.error(error.message);
  })
  .finally(async () => {
    if (win && !win.isDestroyed()) win.destroy();
    if (server) await server.stop();
    if (report) save();
    app.exit(
      report && ['passed', 'not-tested'].includes(report.status) ? 0 : 1,
    );
  });
