/* global document, getComputedStyle, innerHeight, innerWidth */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const WINDOW_CASES = [
  { width: 1280, height: 850 },
  { width: 960, height: 650 },
];
const WAIT_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 50;
const TEST_LONG_VALUE =
  'C:\\Users\\Singer\\OneDrive\\Music\\Utawakui\\Imported library with an intentionally long restored-window path\\tracks';

const probeUserData = process.env.UTAWAKUI_SETTINGS_LAYOUT_USER_DATA;
if (!probeUserData || !path.isAbsolute(probeUserData)) {
  throw new Error('Settings layout probe requires an isolated user-data path.');
}
app.setPath('userData', probeUserData);
app.disableHardwareAcceleration();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(window, expression, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (await window.webContents.executeJavaScript(expression, true)) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

function collectLayout(label) {
  const select = (selector) => document.querySelector(selector);
  const selectAll = (selector) => [...document.querySelectorAll(selector)];
  const layout = select('.app-folder-layout');
  const perimeter = select('.app-folder-layout__perimeter');
  const page = select('.app-folder-page');
  const sheet = select('.app-folder-page__sheet');
  const viewport = select('.app-folder-page__viewport');
  const settings = select('.settings-view');
  const rows = selectAll('.settings-document-item');
  const regularRow = rows.find(
    (row) => !row.classList.contains('settings-document-item--nested'),
  );
  const nestedRow = select('.settings-document-item--nested');
  const values = selectAll('.settings-document-item__value');
  const actions = selectAll('.settings-document-item__actions');
  const required = {
    layout,
    perimeter,
    page,
    sheet,
    viewport,
    settings,
    regularRow,
  };

  for (const [name, element] of Object.entries(required)) {
    if (!element) throw new Error(`${label}: missing ${name}.`);
  }

  const layoutWidth = layout.getBoundingClientRect().width;
  const sectionWidth = regularRow
    .closest('.settings-section')
    .getBoundingClientRect().width;
  const expectedColumns = sectionWidth <= 640 ? 1 : 2;
  const rowStyle = getComputedStyle(regularRow);
  const renderedColumns = rowStyle.gridTemplateColumns
    .split(/\s+/u)
    .filter(Boolean).length;
  const overflowOwners = [page, ...page.querySelectorAll('*')].filter(
    (element) => {
      const overflowY = getComputedStyle(element).overflowY;
      return overflowY === 'auto' || overflowY === 'scroll';
    },
  );
  const horizontalOverflow = {
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    layout: layout.scrollWidth - layout.clientWidth,
    perimeter: perimeter.scrollWidth - perimeter.clientWidth,
    page: page.scrollWidth - page.clientWidth,
    sheet: sheet.scrollWidth - sheet.clientWidth,
    viewport: viewport.scrollWidth - viewport.clientWidth,
    settings: settings.scrollWidth - settings.clientWidth,
  };
  const actionContainment = actions.map((element) => {
    const item = element.closest('.settings-document-item');
    const actionRect = element.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return (
      actionRect.left >= itemRect.left - 1 &&
      actionRect.right <= itemRect.right + 1
    );
  });
  const valueStyles = values.map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const itemRect = element
      .closest('.settings-document-item')
      .getBoundingClientRect();
    return {
      clippedToItem:
        rect.left >= itemRect.left - 1 && rect.right <= itemRect.right + 1,
      overflowing: element.scrollWidth > element.clientWidth,
      overflowX: style.overflowX,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    };
  });
  const nestedPadding = nestedRow
    ? Number.parseFloat(getComputedStyle(nestedRow).paddingBlockStart)
    : null;
  const contentAlignment = selectAll('.settings-section__content').map(
    (content) => {
      const labels = [
        ...content.querySelectorAll(
          '.settings-document-item__title, .settings-feature-gate-row__title, .settings-section__disclosure > .ui-disclosure__summary > .ui-disclosure__label',
        ),
      ].filter(
        (element) =>
          element.getClientRects().length &&
          element.getBoundingClientRect().width,
      );
      const expectedStart = labels[0]?.getBoundingClientRect().left;
      return labels.every(
        (label) =>
          Math.abs(label.getBoundingClientRect().left - expectedStart) <= 1,
      );
    },
  );

  return {
    label,
    viewport: { width: innerWidth, height: innerHeight },
    dockExpanded: Boolean(select('.app-right-dock--expanded')),
    layoutWidth: Math.round(layoutWidth),
    sectionWidth: Math.round(sectionWidth),
    expectedColumns,
    renderedColumns,
    horizontalOverflow,
    overflowOwnerClasses: overflowOwners.map((element) => element.className),
    actionCount: actions.length,
    actionsContained: actionContainment.every(Boolean),
    valueCount: values.length,
    overflowingValueCount: valueStyles.filter((value) => value.overflowing)
      .length,
    valueStyles,
    valuesConstrained: valueStyles.every(
      (value) =>
        value.clippedToItem &&
        value.overflowX === 'hidden' &&
        value.textOverflow === 'ellipsis' &&
        value.whiteSpace === 'nowrap',
    ),
    regularPadding: Number.parseFloat(rowStyle.paddingBlockStart),
    nestedPadding,
    contentAligned: contentAlignment.every(Boolean),
  };
}

function validateMeasurement(measurement) {
  const failures = [];
  if (!measurement.contentAligned)
    failures.push('settings labels do not share the chapter content text axis');
  if (measurement.renderedColumns !== measurement.expectedColumns) {
    failures.push(
      `expected ${measurement.expectedColumns} row columns, got ${measurement.renderedColumns}`,
    );
  }
  const overflowEntries = Object.entries(measurement.horizontalOverflow).filter(
    ([, overflow]) => overflow > 1,
  );
  if (overflowEntries.length) {
    failures.push(
      `horizontal overflow: ${overflowEntries
        .map(([name, overflow]) => `${name}=${overflow}px`)
        .join(', ')}`,
    );
  }
  if (
    measurement.overflowOwnerClasses.length !== 1 ||
    !String(measurement.overflowOwnerClasses[0]).includes(
      'app-folder-page__viewport',
    )
  ) {
    failures.push(
      `expected one document scroll owner, got ${measurement.overflowOwnerClasses.join(', ') || 'none'}`,
    );
  }
  if (!measurement.actionCount || !measurement.actionsContained) {
    failures.push('row actions are missing or extend outside their rows');
  }
  if (
    !measurement.valueCount ||
    !measurement.overflowingValueCount ||
    !measurement.valuesConstrained
  ) {
    failures.push(
      'long-value truncation is missing or extends outside its row',
    );
  }
  if (
    measurement.nestedPadding !== null &&
    measurement.nestedPadding >= measurement.regularPadding
  ) {
    failures.push(
      `nested padding ${measurement.nestedPadding}px is not tighter than regular padding ${measurement.regularPadding}px`,
    );
  }
  return failures;
}

async function setWindowSize(window, size) {
  window.setSize(size.width, size.height);
  await waitFor(
    window,
    `window.innerWidth === ${size.width} && window.innerHeight <= ${size.height}`,
    `${size.width}x${size.height} viewport`,
  );
  await delay(100);
}

async function setDockExpanded(window, expanded) {
  const stateSelector = expanded
    ? '.app-right-dock--expanded'
    : '.app-right-dock--collapsed';
  const hasState = await window.webContents.executeJavaScript(
    `Boolean(document.querySelector(${JSON.stringify(stateSelector)}))`,
    true,
  );
  if (hasState) return;

  const action = expanded
    ? `document.querySelector('.app-right-dock__expand')?.click()`
    : `document.querySelector('.app-right-dock__handle')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`;
  await window.webContents.executeJavaScript(`${action}; true`, true);
  await waitFor(
    window,
    `Boolean(document.querySelector(${JSON.stringify(stateSelector)}))`,
    `Right Dock ${expanded ? 'expanded' : 'collapsed'} state`,
  );
  await delay(100);
}

async function runProbe() {
  const rendererErrors = [];
  const window = new BrowserWindow({
    width: WINDOW_CASES[0].width,
    height: WINDOW_CASES[0].height,
    minWidth: WINDOW_CASES[1].width,
    minHeight: WINDOW_CASES[1].height,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { height: 40 },
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error') rendererErrors.push(details.message);
  });
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await waitFor(
    window,
    `Boolean(document.querySelector('[data-app-settings-trigger]'))`,
    'application shell',
  );
  await window.webContents.executeJavaScript(
    `document.querySelector('[data-app-settings-trigger]').click(); true`,
    true,
  );
  await waitFor(
    window,
    `Boolean(document.querySelector('.settings-document-item'))`,
    'Settings document rows',
  );
  await window.webContents.executeJavaScript(
    `(() => {
      const target = document.querySelector('.settings-document-item__value');
      if (!target) return false;
      target.textContent = ${JSON.stringify(TEST_LONG_VALUE)};
      return true;
    })()`,
    true,
  );

  const measurements = [];
  await setDockExpanded(window, false);
  measurements.push(
    await window.webContents.executeJavaScript(
      `(${collectLayout.toString()})('1280x850 / dock collapsed')`,
      true,
    ),
  );
  await setDockExpanded(window, true);
  measurements.push(
    await window.webContents.executeJavaScript(
      `(${collectLayout.toString()})('1280x850 / dock expanded')`,
      true,
    ),
  );

  await setWindowSize(window, WINDOW_CASES[1]);
  measurements.push(
    await window.webContents.executeJavaScript(
      `(${collectLayout.toString()})('960x650 / dock expanded')`,
      true,
    ),
  );
  await setDockExpanded(window, false);
  measurements.push(
    await window.webContents.executeJavaScript(
      `(${collectLayout.toString()})('960x650 / dock collapsed')`,
      true,
    ),
  );

  const failures = measurements.flatMap((measurement) =>
    validateMeasurement(measurement).map(
      (failure) => `${measurement.label}: ${failure}`,
    ),
  );
  for (const [collapsedIndex, expandedIndex, windowLabel] of [
    [0, 1, '1280x850'],
    [3, 2, '960x650'],
  ]) {
    const collapsedWidth = measurements[collapsedIndex].layoutWidth;
    const expandedWidth = measurements[expandedIndex].layoutWidth;
    if (Math.abs(collapsedWidth - expandedWidth) > 1) {
      failures.push(
        `${windowLabel}: Right Dock disclosure changed Folder width from ${collapsedWidth}px to ${expandedWidth}px`,
      );
    }
  }
  if (rendererErrors.length) {
    failures.push(`renderer errors: ${rendererErrors.join(' | ')}`);
  }

  console.log(JSON.stringify({ measurements, failures }, null, 2));
  window.destroy();
  if (failures.length) throw new Error('Settings window layout probe failed.');
}

app
  .whenReady()
  .then(runProbe)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error.stack || error.message);
    app.exit(1);
  });
