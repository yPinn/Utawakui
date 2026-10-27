// Isolated visible Electron quality probe. Run with ELECTRON_RUN_AS_NODE unset.
/* global require, __dirname, Buffer, process, setTimeout, console */
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'tasks/ab-practice-prototype');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'profile-'));
const library = path.join(profile, 'library');
for (const [id, seconds, rate, channels] of [
  ['short', 10, 44100, 2],
  ['long', 60, 48000, 4],
]) {
  const directory = path.join(library, 'tracks', id);
  fs.mkdirSync(directory, { recursive: true });
  const bytes = Buffer.alloc(44 + seconds * rate * channels * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * channels * 2, 28);
  bytes.writeUInt16LE(channels * 2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  fs.writeFileSync(path.join(directory, 'audio.wav'), bytes);
  require(path.join(root, 'electron/lib/library/lyrics')).saveTrackLyricsText(
    directory,
    { filename: 'manual.lrc', language: 'zh', kind: 'manual' },
    '[00:01.00]先定位這一句\n[00:01.50]接著練習下一句\n[00:03.00]回到起點再唱一次\n',
  );
  require(path.join(root, 'electron/lib/library/metadataIndex')).saveIndexEntry(
    library,
    id,
    { title: `A–B ${id}`, artist: '合成靜音', duration: seconds },
  );
}
fs.writeFileSync(
  path.join(profile, 'config.json'),
  JSON.stringify({
    version: 4,
    downloadDir: library,
    uiTheme: 'light',
    windowCloseBehavior: 'quit',
    autoCheckAppUpdates: false,
    lastSeenAnnouncementVersion: '0.5.1',
    featureConfirmations: {},
  }),
);
app.setPath('userData', profile);
app.setAppPath(root);
process.argv.push('--dev');
let handled = false;
const errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const execute = (window, code) =>
  window.webContents.executeJavaScript(code, true);
async function wait(window, code, budget = 15000) {
  const started = Date.now();
  while (Date.now() - started < budget) {
    if (await execute(window, code)) return;
    await delay(30);
  }
  const context = await execute(
    window,
    'JSON.stringify(window.ab ? {case:window.ab.case,practice:window.ab.practice.state,media:window.ab.p.practiceBoundary.sample(),phase:window.ab.p.state.playbackPhase,pendingStartTrackId:window.ab.p.state.pendingStartTrackId}:null)',
  );
  throw new Error(`Timed out: ${code}\n${context}`);
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message);
  });
  window.webContents.once('did-finish-load', async () => {
    if (
      handled ||
      !window.webContents.getURL().startsWith('http://localhost:5173')
    )
      return;
    handled = true;
    try {
      window.show();
      window.setSize(1000, 850);
      await execute(
        window,
        `(async () => {
        const loaded = path => { const entry=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path); if(!entry)throw Error('App module not loaded: '+path); return entry.name; };
        const {usePlayer} = await import(loaded('/src/composables/usePlayer.js'));
        const {useBgmSession} = await import(loaded('/src/composables/useBgmSession.js'));
        const {usePerformanceSessionPlayback} = await import(loaded('/src/composables/usePerformanceSessionPlayback.js'));
        const {usePlayerPractice} = await import(loaded('/src/composables/usePlayerPractice.js'));
        const p = usePlayer(), bgm = useBgmSession(), session = usePerformanceSessionPlayback(); await bgm.initialize();
        const practice=usePlayerPractice();let unsubscribe;
        const create=options=>{unsubscribe?.();practice.clear();practice.setGap(0);unsubscribe=practice.onMeasurement(options.measure??(()=>{}));return {...practice,dispose(){unsubscribe?.();practice.clear()}}};
        window.ab = { p, bgm, session, practice, create, metrics: [], ended: 0, rows: [] };
        p.onEnded(() => window.ab.ended++); return true;
      })()`,
      );
      if (!['source', 'ui'].includes(process.env.UTAWAKUI_AB_GATE)) {
        for (const id of ['short', 'long'])
          for (const rate of [0.5, 1, 1.5]) {
            await execute(
              window,
              `(async()=>{
          const a=window.ab; a.runtime?.dispose(); a.p.pause();
          const track=await window.Utawakui.getTrack('${id}');
          await a.p.playTrack({...track, usesSeparatedAudio:${id === 'long'}}); a.p.pause();
          await a.p.setTempoRate(${rate}); a.case={id:'${id}',rate:${rate},rangeSeconds:0.5,channels:${id === 'long' ? 4 : 2},sampleRate:${id === 'long' ? 48000 : 44100}};
          a.runtime=a.create({player:a.p,acquireHold:options=>a.bgm.acquirePracticeLane(options),isSessionOwned:()=>a.session.ownsPlayback.value,measure:row=>a.metrics.push({...a.case,...row})}); return true;
        })()`,
            );
            await wait(
              window,
              'window.ab.p.practiceBoundary.sample().seekable.length > 0',
            );
            await wait(
              window,
              `document.querySelector('.player-bar__track')?.textContent.includes('A–B ${id}')`,
            );
            assert.equal(
              await execute(
                window,
                `(async()=>{const a=window.ab;a.runtime.setRange(1,1.5); const ok=await a.runtime.enable(); if(!ok)return false; return a.p.play()})()`,
              ),
              true,
            );
            await wait(window, 'window.ab.runtime.state.laps >= 2');
            assert.ok(
              await execute(
                window,
                `[...document.querySelectorAll('.player-bar__transport button')].some(e=>e.textContent.trim()==='暫停')`,
              ),
            );
            await execute(window, 'window.ab.p.pause(); true');
            assert.equal(
              await execute(window, 'window.ab.p.state.playbackRevision'),
              id === 'short'
                ? [0.5, 1, 1.5].indexOf(rate) + 1
                : [0.5, 1, 1.5].indexOf(rate) + 4,
            );
          }
        for (const gap of [1, 2, 4]) {
          await execute(
            window,
            `(async()=>{const a=window.ab;a.runtime.disable();a.runtime.setGap(${gap});await a.runtime.enable();return a.p.play()})()`,
          );
          await wait(window, 'window.ab.runtime.state.phase === "gap"');
          const before = await execute(window, 'window.ab.runtime.state.laps');
          await wait(window, `window.ab.runtime.state.laps > ${before}`);
          await execute(window, 'window.ab.p.pause(); true');
          await delay(100);
          assert.equal(
            await execute(
              window,
              'window.ab.p.practiceBoundary.sample().paused',
            ),
            true,
          );
          await execute(window, 'window.ab.p.play()');
          await wait(window, 'window.ab.p.state.playbackPhase === "playing"');
          assert.equal(
            await execute(window, 'window.ab.runtime.state.laps'),
            before + 1,
          );
        }
        await execute(
          window,
          'window.ab.runtime.disable(); window.ab.p.pause(); true',
        );
        for (const id of ['short', 'long'])
          for (const mode of ['sequence', 'repeat-one', 'repeat-list'])
            for (const rate of [0.5, 1, 1.5])
              for (const end of ['near', 'eof']) {
                console.log(`EOF case ${id}/${mode}/${rate}/${end}`);
                const duration = id === 'short' ? 10 : 60,
                  b = duration - (end === 'near' ? 0.2 : 0);
                await execute(
                  window,
                  `(async()=>{const a=window.ab;a.runtime.dispose();a.p.pause();const t=await window.Utawakui.getTrack('${id}');await a.p.playTrack({...t,usesSeparatedAudio:${id === 'long'}});a.p.pause();a.p.setPlaybackMode('${mode}');await a.p.setTempoRate(${rate});a.case={id:'${id}',mode:'${mode}',rate:${rate},end:'${end}'};a.runtime=a.create({player:a.p,acquireHold:o=>a.bgm.acquirePracticeLane(o),isSessionOwned:()=>a.session.ownsPlayback.value,measure:row=>a.metrics.push({...a.case,...row})});return true})()`,
                );
                await wait(
                  window,
                  'window.ab.p.practiceBoundary.sample().seekable.length > 0',
                );
                assert.equal(
                  await execute(
                    window,
                    `(async()=>{const a=window.ab;a.runtime.setRange(${b - 0.5},${b});await a.runtime.enable();return a.p.play()})()`,
                  ),
                  true,
                );
                await wait(window, 'window.ab.runtime.state.laps >= 2');
                assert.equal(await execute(window, 'window.ab.ended'), 0);
                await execute(window, 'window.ab.p.pause();true');
                assert.equal(
                  await execute(window, 'window.ab.p.state.playbackMode'),
                  mode,
                );
                assert.equal(
                  await execute(
                    window,
                    'window.ab.p.practiceBoundary.sample().paused',
                  ),
                  true,
                );
                assert.deepEqual(
                  await execute(
                    window,
                    'window.Utawakui.getRecentPlaybackHistory()',
                  ),
                  [],
                );
              }
      }
      if (process.env.UTAWAKUI_AB_GATE === 'source') {
        await execute(
          window,
          `(async()=>{const a=window.ab;const t=await window.Utawakui.getTrack('long');await a.p.playTrack(t);a.p.pause();a.runtime=a.create({player:a.p,acquireHold:o=>a.bgm.acquirePracticeLane(o),isSessionOwned:()=>a.session.ownsPlayback.value});a.runtime.setRange(1,1.5);await a.runtime.enable();await a.p.play();return true})()`,
        );
        const separation = path.join(library, 'tracks/long/separations');
        fs.mkdirSync(separation, { recursive: true });
        fs.copyFileSync(
          path.join(library, 'tracks/long/audio.wav'),
          path.join(separation, 'quick.wav'),
        );
        const manifest = path.join(separation, 'manifest.json');
        fs.writeFileSync(
          manifest,
          JSON.stringify({
            version: 2,
            selectedRecipeId: 'quick',
            results: {
              quick: {
                recipeVersion: 1,
                engineId: 'onnx-mdx',
                modelIds: ['kara2'],
                artifactFilename: 'quick.wav',
                completedAt: new Date().toISOString(),
                outputLayout: 'accompaniment-guide-4ch',
              },
            },
          }),
        );
        window.webContents.send('library:updated');
        await wait(
          window,
          'window.ab.p.state.track?.usesSeparatedAudio && window.ab.p.state.isPlaying && window.ab.runtime.state.enabled',
        );
        await execute(window, 'window.ab.p.pause();true');
        fs.writeFileSync(
          manifest,
          JSON.stringify({ version: 2, selectedRecipeId: null, results: {} }),
        );
        window.webContents.send('library:updated');
        await wait(
          window,
          '!window.ab.p.state.track?.usesSeparatedAudio && window.ab.runtime.state.phase === "armed"',
        );
        assert.equal(
          await execute(window, 'window.ab.p.practiceBoundary.sample().paused'),
          true,
        );
        const original = path.join(library, 'tracks/long/audio.wav'),
          bytes = fs.readFileSync(original);
        bytes[44] = 1;
        fs.writeFileSync(original, bytes);
        window.webContents.send('library:updated');
        await wait(
          window,
          'window.ab.runtime.state.phase === "blocked" && !window.ab.runtime.state.enabled',
        );
        assert.equal(
          await execute(window, 'window.ab.p.practiceBoundary.sample().paused'),
          true,
        );
        assert.equal(await execute(window, 'window.ab.runtime.state.a'), 1);
      }
      if (process.env.UTAWAKUI_AB_GATE === 'ui')
        await require('./uiProbe.cjs')({ window, output, execute, wait });
      assert.equal(await execute(window, 'window.ab.ended'), 0);
      fs.writeFileSync(
        path.join(output, 'visible.png'),
        (await window.webContents.capturePage()).toPNG(),
      );
      const result = await execute(
        window,
        'JSON.parse(JSON.stringify({metrics:window.ab.metrics, ended:window.ab.ended, state:(window.ab.runtime ?? window.ab.practice).state}))',
      );
      const percentile = (rows, key) => {
        const values = rows.map((row) => row[key]).sort((a, b) => a - b);
        return {
          n: values.length,
          p95: values.length
            ? values[Math.max(0, Math.ceil(values.length * 0.95) - 1)]
            : null,
          max: values.length ? Math.max(...values) : null,
        };
      };
      result.boundary = percentile(
        result.metrics.filter((row) => row.kind === 'boundary'),
        'overshootMs',
      );
      result.landing = percentile(
        result.metrics.filter((row) => row.kind === 'seek'),
        'landingMs',
      );
      result.gates = {
        boundary: result.boundary.n
          ? result.boundary.p95 <= 100 && result.boundary.max <= 250
          : null,
        landing: result.landing.n
          ? result.landing.p95 <= 80 && result.landing.max <= 150
          : null,
      };
      result.scope = `visible Electron, shared App player/Main/preload/BGM; gate=${process.env.UTAWAKUI_AB_GATE ?? 'eof'}; synthetic media only, no hardware/OBS quality claim`;
      result.errors = errors;
      result.profile = profile;
      assert.deepEqual(errors, []);
      if (!window.isDestroyed())
        fs.writeFileSync(
          path.join(
            output,
            `results-${process.env.UTAWAKUI_AB_GATE ?? 'eof'}.json`,
          ),
          JSON.stringify(result, null, 2),
        );
      console.log(
        JSON.stringify({
          ok: true,
          boundary: result.boundary,
          landing: result.landing,
          gates: result.gates,
        }),
      );
      app.quit();
    } catch (error) {
      console.error(error.stack);
      console.error(errors);
      fs.writeFileSync(
        path.join(output, 'failure.png'),
        (await window.webContents.capturePage()).toPNG(),
      );
      app.exit(1);
    }
  });
});
require(path.join(root, 'electron/main.js'));
setTimeout(() => app.exit(1), 200000).unref();
