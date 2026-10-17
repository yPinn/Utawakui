import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const playerSource = read('./BgmPlayerPanel.vue');
const transportSource = read('./BgmPlayerTransport.vue');
const currentSource = read('./BgmCurrentSource.vue');
const pickerSource = read('./BgmTrackPicker.vue');
const movableSource = read('../../composables/useBoundedMovableSurface.js');
const tokensSource = read('../../styles/tokens.css');

function expectNoneRule(source, selectorPattern) {
  const rule = source.match(
    new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 'su'),
  );

  expect(rule?.[1]).toContain('-webkit-user-select: none;');
  expect(rule?.[1]).toContain('user-select: none;');
}

describe('BGM player Token v2 layout contract', () => {
  it('shares the large-surface radius role with other major shell surfaces', () => {
    expect(playerSource).toContain('radius="lg"');
  });

  it('lets the shared scroll layout own content inset and scrollbar reserve', () => {
    expect(pickerSource).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue'",
    );
    expect(pickerSource).toContain('<UiScrollLayout');
    expect(pickerSource).toContain('axis="vertical"');
    expect(pickerSource).toContain('scrollbar-visibility="auto"');
    expect(playerSource).not.toContain('UiScrollRegion');
    expect(playerSource).not.toContain('bgm-player__picker-body');
    expect(playerSource).not.toContain('--ui-scroll-layout-padding-inline-end');
    expect(pickerSource).not.toContain('--ui-scroll-layout-padding-inline-end');
  });

  it('sizes against the shell boundary with bounded min and max values', () => {
    const playerRule =
      playerSource.match(/\.bgm-player\s*\{([\s\S]*?)\n\}/u)?.[1] ?? '';

    expect(playerRule).toContain(
      'inline-size: min(var(--ui-bgm-player-inline-size), 100%);',
    );
    expect(playerRule).toContain(
      'min-inline-size: min(var(--ui-bgm-player-min-inline-size), 100%);',
    );
    expect(playerRule).toContain(
      'max-inline-size: min(var(--ui-bgm-player-max-inline-size), 100%);',
    );
    expect(playerRule).toContain('min-block-size: 0;');
    expect(playerRule).toMatch(
      /max-block-size:\s*min\(\s*var\(--ui-bgm-player-max-block-size\),\s*100%\s*\);/u,
    );
    expect(playerRule).toContain('overflow: hidden;');
    expect(playerRule).not.toMatch(/100v[wh]/u);
    expect(tokensSource).toContain('--ui-bgm-player-min-inline-size: 18rem;');
    expect(tokensSource).toContain('--ui-bgm-player-inline-size: 20rem;');
    expect(tokensSource).toContain('--ui-bgm-player-max-inline-size: 22rem;');
    expect(tokensSource).toContain('--ui-bgm-player-max-block-size: 28rem;');
    expect(tokensSource).not.toMatch(
      /--ui-bgm-player-[^:]+:\s*var\(--ui-player-bar-panel-/u,
    );
    expect(tokensSource).not.toContain(
      '--ui-bgm-player-viewport-inline-offset',
    );
    expect(tokensSource).not.toContain('--ui-bgm-player-viewport-block-offset');
  });

  it('reclamps after either the player or its safe boundary changes size', () => {
    expect(movableSource).toContain('resizeObserver?.observe(element);');
    expect(movableSource).toContain(
      'resizeObserver?.observe(element.parentElement);',
    );
    expect(playerSource).toContain('await nextTick();');
    expect(playerSource).toContain('reclamp();');
  });

  it('uses one compact gap-owned transport composition instead of repeated block margins', () => {
    expect(transportSource).toMatch(
      /\.bgm-transport\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-space-2\);/su,
    );
    expect(transportSource).not.toContain('margin-top:');
  });

  it('adapts transport layout to the player container rather than the window', () => {
    expect(playerSource).toContain('container-type: inline-size;');
    expect(playerSource).toContain('container-name: bgm-player;');
    expect(transportSource).not.toContain('@media (max-width: 32rem)');
    expect(transportSource).toContain(
      'min-inline-size: var(--ui-bgm-player-volume-inline-size);',
    );
    expect(transportSource).not.toContain('min-width: 5rem;');
    expect(transportSource).toMatch(
      /\.bgm-transport__controls\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--ui-icon-button-size-md\)\s+auto\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(\s*--ui-icon-button-size-md\s*\);/su,
    );
    expect(transportSource).toMatch(
      /\.bgm-transport__volume\s*\{[^}]*inline-size:\s*100%;/su,
    );
    expect(transportSource).not.toContain('flex: 1 0 100%;');
  });

  it('keeps stable identity and time without obsolete badge width slots', () => {
    expect(tokensSource).not.toContain(
      '--ui-bgm-player-session-status-inline-size:',
    );
    expect(tokensSource).not.toContain(
      '--ui-bgm-player-phase-status-inline-size:',
    );
    expect(tokensSource).not.toContain(
      '--ui-bgm-player-restore-status-inline-size:',
    );
    expect(tokensSource).toContain('--ui-bgm-player-time-inline-size:');
    expect(playerSource).not.toContain(
      'inline-size: var(--ui-bgm-player-session-status-inline-size)',
    );
    expect(currentSource).toContain('class="bgm-current-source__status"');
    expect(transportSource).toMatch(
      /\.bgm-transport__time\s*\{[^}]*inline-size:\s*var\(--ui-bgm-player-time-inline-size\);/su,
    );
    expect(currentSource).toMatch(
      /\.bgm-current-source\s*\{[^}]*block-size:\s*var\(--ui-bgm-player-artwork-size\);/su,
    );
  });

  it('keeps padding, margin, and gap values on the shared spacing scale', () => {
    const declarations = [
      playerSource,
      transportSource,
      currentSource,
      pickerSource,
    ].flatMap((source) => [
      ...source.matchAll(
        /(?:^|\s)(?:padding(?:-[\w-]+)?|margin(?:-[\w-]+)?|gap):\s*([^;]+);/gmu,
      ),
    ]);

    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration[1]).not.toMatch(/\b\d*\.?\d+(?:px|rem)\b/iu);
    }
    expect(playerSource).toMatch(
      /\.bgm-player\s*\{[^}]*gap:\s*var\(--ui-space-2\);[^}]*padding:\s*var\(--ui-space-3\);/su,
    );
    expect(currentSource).not.toContain('margin:');
    expect(tokensSource).toContain('--ui-track-list-gap: var(--ui-space-1);');
  });

  it('guards draggable and status chrome without blocking useful text', () => {
    expectNoneRule(playerSource, '\\.bgm-player__header');
    expectNoneRule(
      transportSource,
      '\\.bgm-transport__progress,\\s*\\.bgm-transport__controls',
    );
    expect(transportSource).not.toMatch(
      /\.bgm-transport__error\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(pickerSource).not.toMatch(
      /\.bgm-track-picker(?:__results)?\s*\{[^}]*user-select:\s*none;/su,
    );
  });
});
