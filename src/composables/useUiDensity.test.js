import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const activeTokensSource = readFileSync(
  new URL('../styles/tokens.css', import.meta.url),
  'utf8',
);
const candidateTokensSource = readFileSync(
  new URL('../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

async function loadDensity(initialUiDensity = 'compact') {
  vi.resetModules();
  const { effectScope } = await import('vue');
  const dataset = {};
  let densityListener;
  const unsubscribe = vi.fn();
  const onUiDensityChanged = vi.fn((listener) => {
    densityListener = listener;
    return unsubscribe;
  });
  vi.stubGlobal('document', { documentElement: { dataset } });
  vi.stubGlobal('window', {
    Utawakui: { initialUiDensity, onUiDensityChanged },
  });
  const module = await import('./useUiDensity.js');
  return {
    ...module,
    effectScope,
    dataset,
    densityListener: () => densityListener,
    onUiDensityChanged,
    unsubscribe,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('useUiDensity', () => {
  it('applies the bounded preload value before a component scope starts', async () => {
    const compact = await loadDensity('compact');
    expect(compact.dataset.uiDensity).toBe('compact');

    const standard = await loadDensity('standard');
    expect(standard.dataset.uiDensity).toBe('standard');

    const invalid = await loadDensity('dense');
    expect(invalid.dataset.uiDensity).toBe('compact');
  });

  it('subscribes once, ignores invalid runtime values, and cleans up with the owner scope', async () => {
    const loaded = await loadDensity();
    const scope = loaded.effectScope();
    const state = scope.run(() => loaded.useUiDensity());

    expect(loaded.onUiDensityChanged).toHaveBeenCalledOnce();
    loaded.densityListener()('standard');
    expect(state.density.value).toBe('standard');
    expect(loaded.dataset.uiDensity).toBe('standard');

    loaded.densityListener()('wide');
    expect(state.density.value).toBe('standard');
    expect(loaded.dataset.uiDensity).toBe('standard');

    scope.stop();
    expect(loaded.unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps App as the composition surface for the global owner', () => {
    expect(appSource).toContain(
      "import { useUiDensity } from './composables/useUiDensity.js';",
    );
    expect(appSource).toContain('useUiDensity();');
  });

  it('limits production density adoption to PlayerBar trailing geometry', () => {
    expect(candidateTokensSource).toContain(
      ":root[data-ui-system='v2'][data-ui-density='compact']",
    );

    const standardBlock = activeTokensSource.match(
      /:root\[data-ui-density='standard'\]\s*\{([^}]*)\}/su,
    )?.[1];
    const compactBlock = activeTokensSource.match(
      /:root\[data-ui-density='compact'\]\s*\{([^}]*)\}/su,
    )?.[1];

    expect(standardBlock).toContain('--ui-player-bar-action-size: 2.25rem');
    expect(standardBlock).toContain(
      '--ui-player-bar-volume-slider-width: 6rem',
    );
    expect(compactBlock).toContain(
      '--ui-player-bar-action-size: var(--ui-space-6)',
    );
    expect(compactBlock).toContain('--ui-player-bar-volume-slider-width: 5rem');

    for (const block of [standardBlock, compactBlock]) {
      expect(block).not.toContain('--ui-control-height:');
      expect(block).not.toContain('--ui-row-height:');
      expect(block).not.toContain('--ui-player-bar-height:');
    }
  });
});
