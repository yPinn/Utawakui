/* global require, process, __dirname, console, setTimeout, setInterval, clearInterval */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { performance } = require('node:perf_hooks');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
app.setPath('userData', path.join(config.out, 'browser-profile'));
app.on('window-all-closed', () => {});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    const cases = config.fixtures.filter((item) =>
      ['mono', 'wav', 'mp3', 'aac', 'opus', 'medium', 'long', 'eight'].includes(
        item.id,
      ),
    );
    const routes = new Map(cases.map((item) => ['/' + item.id, item.file]));
    const server = http.createServer((request, response) => {
      const file = routes.get(request.url);
      if (!file) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
      });
      fs.createReadStream(file).pipe(response);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const results = [];
    try {
      for (const item of [
        ...cases,
        {
          ...cases.find((entry) => entry.id === 'medium'),
          id: 'medium-cancel',
          route: 'medium',
          cancel: true,
        },
      ]) {
        const w = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            partition: 'waveform-' + item.id + '-' + Date.now(),
          },
        });
        await w.loadFile(path.join(__dirname, 'browser.html'));
        await delay(40);
        let maxMainRss = process.memoryUsage().rss;
        const initial = new Map(
          app
            .getAppMetrics()
            .map((metric) => [
              metric.pid,
              metric.memory?.workingSetSize * 1024 || 0,
            ]),
        );
        const rendererPid = w.webContents.getOSProcessId();
        let memorySamples = 0;
        const peaks = new Map();
        const sample = () => {
          maxMainRss = Math.max(maxMainRss, process.memoryUsage().rss);
          for (const metric of app.getAppMetrics())
            if (metric.pid === rendererPid) {
              memorySamples++;
              peaks.set(
                metric.pid,
                Math.max(
                  peaks.get(metric.pid) || 0,
                  (metric.memory?.peakWorkingSetSize ||
                    metric.memory?.workingSetSize ||
                    0) * 1024,
                ),
              );
            }
        };
        sample();
        const sampler = setInterval(sample, 20);
        const started = performance.now();
        try {
          const value = await w.webContents.executeJavaScript(
            'window.runDecode(' +
              JSON.stringify({
                url: `http://127.0.0.1:${server.address().port}/${item.route || item.id}`,
                metadata: item.metadata,
                cancel: item.cancel || false,
              }) +
              ')',
          );
          sample();
          const rendererPeakBytes = Math.max(0, ...peaks.values());
          const rendererDeltaBytes = Math.max(
            0,
            ...[...peaks].map(
              ([pid, bytes]) => bytes - (initial.get(pid) || 0),
            ),
          );
          results.push({
            id: item.id,
            ...value,
            wallMs: performance.now() - started,
            rendererPeakBytes,
            rendererDeltaBytes,
            mainPeakRssBytes: maxMainRss,
            sampleIntervalMs: 20,
            memorySamples,
          });
        } catch (error) {
          results.push({
            id: item.id,
            status: 'probe-failed',
            code: error.message,
          });
        } finally {
          clearInterval(sampler);
          w.destroy();
          await delay(40);
        }
      }
      fs.writeFileSync(
        path.join(config.out, 'browser.json'),
        JSON.stringify(
          {
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            results,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify({ browserCases: results.length }));
    } finally {
      server.close();
      app.quit();
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
setTimeout(() => app.exit(1), 180000).unref();
