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
      expect(source).not.toContain('token-v1-invalidation');
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
    const surfaceBlock = tokens.match(
      /^\[data-ui-system='v2'\]\s*\{([\s\S]*?)\n\}/mu,
    )?.[1];

    expect(rootBlock).toContain('color-scheme: dark');
    expect(rootBlock).not.toContain('var(--ui-');
    expect(lightRootBlock).toContain('color-scheme: light');
    expect(bodyBlock).toContain('background: Canvas');
    expect(bodyBlock).toContain('color: CanvasText');
    expect(bodyBlock).not.toContain('var(--ui-');
    expect(baseStyles).not.toContain('var(--ui-');
    expect(surfaceBlock).toContain('background: var(--ui-color-canvas)');
    expect(surfaceBlock).toContain('color: var(--ui-color-text)');
    expect(surfaceBlock).toContain('font-family: var(--ui-font-family-base)');
    expect(surfaceBlock).toContain('font-size: var(--ui-font-size-md)');
  });

  it('keeps each native window substrate synchronized with its registered renderer canvas', () => {
    const mainDarkCanvas = tokens.match(
      /--ui-palette-neutral-950:\s*(#[\da-f]{6});/iu,
    )?.[1];
    const mainLightCanvas = tokens.match(
      /--ui-palette-warm-neutral-200:\s*(#[\da-f]{6});/iu,
    )?.[1];
    const mainDarkText = tokens.match(
      /--ui-palette-warm-neutral-100:\s*(#[\da-f]{6});/iu,
    )?.[1];
    const mainLightText = tokens.match(
      /--ui-palette-neutral-900:\s*(#[\da-f]{6});/iu,
    )?.[1];
    expect(mainDarkCanvas).toBe('#191a1e');
    expect(mainLightCanvas).toBe('#e8e4dd');
    expect(mainDarkText).toBe('#f3f1ec');
    expect(mainLightText).toBe('#272928');
    expect(tokens).toContain(
      '--ui-color-canvas: var(--ui-palette-neutral-950)',
    );
    expect(tokens).toMatch(
      /:root\[data-ui-theme='light'\] \[data-ui-system='v2'\][\s\S]*?--ui-color-canvas:\s*var\(--ui-palette-warm-neutral-200\);/u,
    );
    expect(windowState).toContain(
      `dark: { color: '${mainDarkCanvas}', symbolColor: '${mainDarkText}' }`,
    );
    expect(windowState).toContain(
      `light: { color: '${mainLightCanvas}', symbolColor: '${mainLightText}' }`,
    );
    expect(windowState).toContain('height: 40');
    expect(performerWindow).toContain(
      `initialTheme === 'light' ? '${mainLightCanvas}' : '${mainDarkCanvas}'`,
    );
  });
});
