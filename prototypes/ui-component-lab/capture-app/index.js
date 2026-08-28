/* global __dirname, console, process, require, setTimeout */

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const labDir = path.resolve(__dirname, '..');
const outputDir = path.join(labDir, 'screenshots');
const captureDataDir = process.env.UTAWAKUI_UI_LAB_USER_DATA;

if (!captureDataDir) {
  throw new Error('Capture must be started through capture-app/run.js');
}

const variants = [
  {
    theme: 'dark',
    state: 'default',
    tab: 'controls',
    motion: 'full',
    name: 'ui-components-dark-default-1280x900.png',
  },
  {
    theme: 'light',
    state: 'default',
    tab: 'controls',
    motion: 'full',
    name: 'ui-components-light-default-1280x900.png',
  },
  {
    theme: 'light',
    state: 'invalid',
    tab: 'controls',
    motion: 'full',
    name: 'ui-components-light-invalid-1280x900.png',
  },
  {
    theme: 'dark',
    state: 'invalid',
    tab: 'controls',
    motion: 'full',
    name: 'ui-components-dark-invalid-1280x900.png',
  },
  {
    theme: 'dark',
    state: 'loading',
    tab: 'controls',
    motion: 'reduced',
    name: 'ui-components-dark-loading-reduced-1280x900.png',
  },
  {
    theme: 'dark',
    state: 'disabled',
    tab: 'controls',
    motion: 'full',
    name: 'ui-components-dark-disabled-1280x900.png',
  },
  {
    theme: 'dark',
    state: 'default',
    tab: 'feedback',
    motion: 'full',
    name: 'ui-components-dark-feedback-1280x900.png',
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

async function verifyContracts(window) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };

    const controls = [...document.querySelectorAll(
      '.lab-fields input, .lab-fields textarea, .lab-fields select',
    )];
    for (const control of controls) {
      assert(control.id, 'field control is missing an id');
      assert(
        document.querySelector('label[for="' + CSS.escape(control.id) + '"]'),
        'field control is missing its label: ' + control.id,
      );
    }

    const state = document.getElementById('lab-state');
    state.value = 'invalid';
    state.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const title = document.getElementById('lab-title');
    const error = document.getElementById('lab-title-error');
    assert(title.getAttribute('aria-invalid') === 'true', 'invalid state missing');
    assert(error?.getAttribute('role') === 'alert', 'field alert missing');
    assert(
      title.getAttribute('aria-describedby')?.split(/\\s+/).includes(error.id),
      'field error description is not linked',
    );

    state.value = 'disabled';
    state.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(document.getElementById('lab-title').disabled, 'disabled field missing');

    const firstTab = document.getElementById('lab-controls-tab');
    firstTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const nextTab = document.getElementById('lab-feedback-tab');
    assert(nextTab.getAttribute('aria-selected') === 'true', 'tab did not select');
    assert(document.activeElement === nextTab, 'tab focus did not move');

    return { controls: controls.length };
  })()`);
  console.log(
    `verified ${result.controls} native field contracts and tab keyboard behavior`,
  );
}

async function verifyZoom(window) {
  window.webContents.setZoomFactor(2);
  await waitForStablePaint(window);
  const overflow = await window.webContents.executeJavaScript(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  if (overflow > 1)
    throw new Error(`200% zoom horizontal overflow: ${overflow}`);
  window.webContents.setZoomFactor(1);
  console.log('verified 200% zoom without horizontal overflow');
}

async function captureVariant(variant, index) {
  const entryPath = path.join(labDir, '.build', 'index.html');
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
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

  const loadVariant = async () => {
    await window.loadFile(entryPath, {
      query: {
        theme: variant.theme,
        state: variant.state,
        tab: variant.tab,
        motion: variant.motion,
      },
    });
    await waitForStablePaint(window);
  };

  await loadVariant();
  if (index === 0) {
    await verifyContracts(window);
    await verifyZoom(window);
    await loadVariant();
  }
  await window.webContents.executeJavaScript(`(() => {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    assert(
      document.documentElement.dataset.uiTheme === ${JSON.stringify(variant.theme)},
      'capture theme did not initialize',
    );
    assert(
      document.getElementById('lab-state').value === ${JSON.stringify(variant.state)},
      'capture state did not initialize',
    );
    assert(
      document.getElementById(${JSON.stringify(`lab-${variant.tab}-tab`)}).getAttribute('aria-selected') === 'true',
      'capture tab did not initialize',
    );
    assert(
      document.documentElement.dataset.uiMotion === ${JSON.stringify(variant.motion)},
      'capture motion preference did not initialize',
    );

    const state = ${JSON.stringify(variant.state)};
    if (state === 'invalid') {
      assert(
        document.getElementById('lab-title').getAttribute('aria-invalid') === 'true',
        'invalid capture is missing native invalid state',
      );
      assert(
        document.getElementById('lab-title-error')?.getAttribute('role') === 'alert',
        'invalid capture is missing its alert',
      );
    }
    if (state === 'loading') {
      const busy = document.querySelector('.ui-btn[aria-busy="true"]');
      const spinner = busy?.querySelector('.ui-btn__spinner');
      assert(busy?.disabled, 'loading capture action is not disabled');
      assert(spinner, 'loading capture is missing its busy glyph');
      assert(
        getComputedStyle(spinner).animationName === 'none',
        'reduced-motion loading glyph is still animated',
      );
    }
    if (state === 'disabled') {
      assert(document.getElementById('lab-title').disabled, 'disabled capture field is active');
      assert(
        document.querySelector('.lab-panel .ui-btn')?.disabled,
        'disabled capture action is active',
      );
    }

    const tab = ${JSON.stringify(variant.tab)};
    assert(
      Boolean(document.getElementById('lab-' + tab + '-panel')),
      'capture panel did not initialize',
    );
  })()`);
  const image = await window.webContents.capturePage();
  const outputPath = path.join(outputDir, variant.name);
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`captured ${outputPath}`);
  window.destroy();
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    for (let index = 0; index < variants.length; index += 1) {
      await captureVariant(variants[index], index);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    captureInProgress = false;
    console.log(`UTAWAKUI_UI_LAB_COMPLETE:${process.exitCode ?? 0}`);
  }
});

app.on('window-all-closed', () => {
  if (!captureInProgress) app.quit();
});
