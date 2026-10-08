import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const tokensSource = readFileSync(
  new URL('../styles/tokens.css', import.meta.url),
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

  it('uses one compact geometry remap without creating another type ramp', () => {
    expect(tokensSource).toContain(
      ":root[data-ui-density='compact'] [data-ui-system='v2']",
    );

    const compactBlock = tokensSource.match(
      /:root\[data-ui-density='compact'\] \[data-ui-system='v2'\]\s*\{([^}]*)\}/su,
    )?.[1];

    expect(compactBlock).toContain('--ui-control-height: 2rem');
    expect(compactBlock).toContain('--ui-track-row-min-height: 2.75rem');
    expect(compactBlock).not.toContain('--ui-player-bar-height');
    expect(compactBlock).toContain('--ui-player-volume-inline-size: 6rem');
    expect(compactBlock).not.toContain('--ui-font-size-');
    expect(compactBlock).not.toContain('--ui-line-height-');
    expect(tokensSource).not.toContain("[data-ui-system='v1']");
  });
});
