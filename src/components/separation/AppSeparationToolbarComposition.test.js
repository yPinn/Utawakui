import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  new URL('../../App.vue', import.meta.url),
  'utf8',
);

describe('App accompaniment toolbar composition', () => {
  it('keeps the titlebar popover as the single accompaniment surface', () => {
    expect(appSource).toContain('<AppTitleBar');
    expect(appSource).not.toContain('SeparationQueuePanel');
    expect(appSource).not.toContain('RIGHT_DOCK_SURFACE_SEPARATION');
    expect(appSource).not.toContain('separationExpanded');
    expect(appSource).not.toContain('openSeparationSurface');
    expect(appSource).not.toContain('@open-separation');

    const playerStart = appSource.indexOf('<PlayerBar');
    const playerEnd = appSource.indexOf('/>', playerStart);
    const playerMarkup = appSource.slice(playerStart, playerEnd);
    expect(playerMarkup).not.toContain('separation-expanded');
    expect(playerMarkup).not.toContain('separation-controls');
    expect(playerMarkup).not.toContain('separation-activate');
  });
});
