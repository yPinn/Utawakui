import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const baseStyles = readSource('./base.css');
const tokens = readSource('./tokens.css');
const mainEntry = readSource('../main.js');
const performerEntry = readSource('../performer-main.js');
const mainHtml = readSource('../../index.html');
const performerHtml = readSource('../../performer-view.html');
const windowState = readSource('../../electron/main/windowState.js');
const performerWindow = readSource('../../electron/main/performerWindow.js');

function cssBlock(selector) {
  return baseStyles.match(
    new RegExp(
      `${selector.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
      'u',
    ),
  )?.[1];
}

describe('renderer viewport boundary', () => {
  it.each([
    ['main', mainEntry],
    ['performer', performerEntry],
  ])(
    'registers the %s surface before creating and mounting Vue',
    (renderer, source) => {
      expect(source).toContain(
        "import { registerRendererSurfaceRoot } from './utils/rendererSurfaceRegistry.js';",
      );
      expect(source).toContain(
        `const surfaceRoot = registerRendererSurfaceRoot('${renderer}');`,
      );
      expect(source.indexOf('const surfaceRoot =')).toBeLessThan(
        source.indexOf('createApp('),
      );
      expect(source).toContain('app.mount(surfaceRoot);');
      expect(source).not.toContain('document.documentElement.dataset.uiSystem');
      expect(source).toContain("import './styles/tokens.css';");
      expect(source).not.toContain('tokens-v2.css');
    },
  );

  it('keeps both HTML documents free of a visual-system root', () => {
    for (const html of [mainHtml, performerHtml]) {
      expect(html).toContain('<div id="app"></div>');
      expect(html).not.toMatch(/<html[^>]*data-ui-system/u);
      expect(html).not.toMatch(/<body[^>]*data-ui-system/u);
    }
  });

  it('keeps viewport geometry neutral and projects visuals from registered #app', () => {
    expect(baseStyles).toMatch(
      /html,\s*body,\s*#app\s*\{[^}]*inline-size:\s*100%;[^}]*block-size:\s*100%;/su,
    );

    const rootBlock = cssBlock(':root');
    const lightRootBlock = cssBlock(":root[data-ui-theme='light']");
    const bodyBlock = cssBlock('body');
    const appBlock = cssBlock('#app[data-ui-surface][data-ui-system]');

    expect(rootBlock).toContain('color-scheme: dark');
    expect(rootBlock).not.toContain('var(--ui-');
    expect(lightRootBlock).toContain('color-scheme: light');
    expect(bodyBlock).toContain('background: Canvas');
    expect(bodyBlock).toContain('color: CanvasText');
    expect(bodyBlock).not.toContain('var(--ui-');
    expect(appBlock).toContain('background: var(--ui-color-canvas)');
    expect(appBlock).toContain('color: var(--ui-color-text)');
    expect(appBlock).toContain('font-family: var(--ui-font-family-base)');
    expect(appBlock).toContain('font-size: var(--ui-font-size-md)');
  });

  it('keeps native window substrates synchronized with the active v1 canvas', () => {
    const darkCanvas = tokens.match(
      /--ui-color-canvas:\s*(#[\da-f]{6});/iu,
    )?.[1];
    const lightCanvas = tokens.match(
      /:root\[data-ui-theme='light'\][\s\S]*?--ui-color-canvas:\s*(#[\da-f]{6});/iu,
    )?.[1];

    expect(darkCanvas).toBe('#1f2328');
    expect(lightCanvas).toBe('#f7f1e7');
    expect(windowState).toContain(
      `dark: { color: '${darkCanvas}', symbolColor: '${lightCanvas}' }`,
    );
    expect(windowState).toContain(
      `light: { color: '${lightCanvas}', symbolColor: '${darkCanvas}' }`,
    );
    expect(performerWindow).toContain(
      `initialTheme === 'light' ? '${lightCanvas}' : '${darkCanvas}'`,
    );
  });
});
