/* global require, module */
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { setTimeout: delay } = require('node:timers/promises');
module.exports = async function probeLoopUi({ window, output, execute, wait }) {
  window.setSize(960, 850);
  const clickText = (text) =>
    execute(
      window,
      `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e||e.disabled)throw Error('Missing button '+${JSON.stringify(text)});e.click();return true})()`,
    );
  const entry = '.player-practice-loop button';
  const clickEntry = () =>
    execute(
      window,
      `document.querySelector(${JSON.stringify(entry)}).click();true`,
    );
  const frame = async (name) => {
    window.show();
    window.focus();
    await execute(
      window,
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    await delay(100);
    fs.writeFileSync(
      path.join(output, name),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  await execute(
    window,
    "(async()=>{const e=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/composables/useAppView.js');const {useAppView}=await import(e.name);useAppView().openLiveLyrics();return true})()",
  );
  await wait(window, `!!document.querySelector(${JSON.stringify(entry)})`);
  assert.equal(
    await execute(
      window,
      `document.querySelector(${JSON.stringify(entry)}).disabled`,
    ),
    true,
  );
  await frame('ui-empty-light.png');
  await execute(
    window,
    "(async()=>{const a=window.ab;await a.p.playTrack(await window.Utawakui.getTrack('short'));a.p.pause();return true})()",
  );
  await wait(
    window,
    `!document.querySelector(${JSON.stringify(entry)}).disabled`,
  );
  if (
    !(await execute(
      window,
      "!!document.querySelector('.player-practice__primary')",
    ))
  )
    await clickEntry();
  await wait(window, "!!document.querySelector('.player-practice__primary')");
  assert.equal(
    await execute(
      window,
      "document.querySelector('.player-practice [role=status]')?.textContent.includes('每輪休息 2 秒')",
    ),
    true,
  );
  assert.equal(
    await execute(
      window,
      "document.querySelectorAll('.performance-lyrics-workspace .app-folder-workspace-toolbar__actions button.ui-icon-btn').length",
    ),
    3,
  );
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await wait(window, "!document.querySelector('.player-practice__primary')");
  assert.equal(
    await execute(
      window,
      `document.activeElement === document.querySelector(${JSON.stringify(entry)})`,
    ),
    true,
  );
  await clickEntry();
  await wait(window, "!!document.querySelector('.player-practice__primary')");
  assert.equal(
    await execute(window, "!!document.querySelector('#practice-a')"),
    false,
  );
  for (const [point, time] of [
    ['起點', 1],
    ['終點', 1.5],
  ]) {
    await execute(window, `window.ab.p.seek(${time});true`);
    await wait(window, '!window.ab.p.practiceBoundary.sample().seeking');
    await execute(
      window,
      `document.querySelector('button[aria-label^="將目前位置設為${point}"]').click();true`,
    );
  }
  await wait(
    window,
    "[...document.querySelectorAll('.player-practice__mark small')].every(e=>e.textContent==='00:01') && window.ab.practice.state.b===1.5",
  );
  await frame('ui-compact-light-960.png');
  await clickText('開始片段練習');
  await wait(
    window,
    "[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='暫停片段練習') && window.ab.p.state.isPlaying",
  );
  assert.equal(
    await execute(window, 'window.ab.p.practiceBoundary.sample().paused'),
    false,
  );
  await wait(window, 'window.ab.practice.state.phase === "gap"');
  assert.equal(
    await execute(window, 'window.ab.practice.state.waitingSeconds'),
    2,
  );
  const restStarted = Date.now();
  await wait(
    window,
    'window.ab.practice.state.laps >= 1 && window.ab.p.state.isPlaying',
  );
  assert.ok(
    Date.now() - restStarted >= 1900,
    'default rest should not immediately repeat',
  );
  await clickText('暫停片段練習');
  assert.equal(
    await execute(
      window,
      'window.ab.practice.state.enabled && window.ab.p.practiceBoundary.sample().paused',
    ),
    true,
  );
  await clickText('進階設定');
  await wait(window, "!!document.getElementById('practice-gap')");
  await execute(
    window,
    "(()=>{const e=document.getElementById('practice-gap');e.value='4';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()",
  );
  await clickText('進階設定');
  await clickText('開始片段練習');
  await wait(
    window,
    "document.querySelector('.player-practice [role=status]')?.textContent.includes('等待 4 秒')",
  );
  await frame('ui-gap-light-960.png');
  await clickText('暫停片段練習');
  const sample = await execute(window, 'window.ab.p.samplePlaybackClock()');
  assert.equal(sample.positionMs, 1000);
  assert.equal(sample.phase, 'paused');
  await clickText('切換為深色主題');
  window.setSize(1280, 850);
  if (
    !(await execute(
      window,
      "!!document.querySelector('.player-practice__primary')",
    ))
  )
    await clickEntry();
  await wait(window, "!!document.querySelector('.player-practice__primary')");
  await clickText('進階設定');
  await wait(window, "!!document.getElementById('practice-b')");
  await execute(
    window,
    "(()=>{const e=document.getElementById('practice-b');e.value='1.2';e.dispatchEvent(new Event('input',{bubbles:true}));return true})()",
  );
  await wait(
    window,
    "[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='開始片段練習'&&e.disabled)",
  );
  await frame('ui-invalid-dark-1280.png');
  await execute(
    window,
    "(()=>{const e=document.getElementById('practice-b');e.value='1.5';e.dispatchEvent(new Event('input',{bubbles:true}));return true})()",
  );
  await clickText('開始片段練習');
  await wait(window, 'window.ab.p.state.isPlaying');
  await clickText('暫停片段練習');
  assert.equal(
    await execute(window, 'window.ab.p.practiceBoundary.sample().paused'),
    true,
  );
  assert.equal(
    await execute(
      window,
      "(()=>{const row=document.querySelector('.player-practice__primary'),r=row.getBoundingClientRect();return [...row.querySelectorAll('button')].every(b=>{const p=b.getBoundingClientRect();return p.left>=r.left&&p.right<=r.right+1})})()",
    ),
    true,
  );
  await execute(window, 'window.ab.p.pause();true');
  if (
    !(await execute(
      window,
      "!!document.querySelector('.player-practice__primary')",
    ))
  )
    await clickEntry();
  await wait(window, "!!document.querySelector('.player-practice__primary')");
  await frame('ui-ready-dark-1280.png');
  assert.deepEqual(
    await execute(
      window,
      "[...document.querySelectorAll('.player-practice__primary button.ui-icon-btn')].map(b=>b.textContent.trim())",
    ),
    ['清除練習區間', '開始片段練習', '進階設定'],
  );
  assert.equal(
    await execute(
      window,
      "(()=>{const a=document.getElementById('practice-a').getBoundingClientRect(),b=document.getElementById('practice-b').getBoundingClientRect();return Math.abs(a.top-b.top)<1 && a.right<b.left})()",
    ),
    true,
  );
  assert.equal(
    await execute(
      window,
      "document.querySelector('.ui-popover').scrollWidth>document.querySelector('.ui-popover').clientWidth",
    ),
    false,
  );
  assert.equal(
    await execute(
      window,
      `!document.querySelector('.player-bar '+${JSON.stringify(entry)})`,
    ),
    true,
  );
  await clickText('開始片段練習');
  await wait(window, 'window.ab.p.state.isPlaying');
  await clickText('清除練習區間');
  assert.equal(await execute(window, 'window.ab.practice.state.a'), null);
  assert.equal(
    await execute(window, 'window.ab.p.practiceBoundary.sample().paused'),
    false,
  );
};
