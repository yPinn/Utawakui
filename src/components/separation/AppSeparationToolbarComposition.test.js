import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  new URL('../../App.vue', import.meta.url),
  'utf8',
);

describe('App accompaniment preparation composition', () => {
  it('keeps accompaniment inside the shared preparation Dock instead of a titlebar popover', () => {
    expect(appSource).toContain('<AppTitleBar');
    expect(appSource).toContain('<PreparationDockPanel');
    expect(appSource).toContain('useSeparationQueue()');
    expect(appSource).toContain('usePreparationActivity()');
    expect(appSource).not.toContain('useImportSession()');
    expect(appSource).not.toContain('useLocalImport()');
    expect(appSource).toContain('preparationActivityIndicator({');
    expect(appSource).toContain(
      ':preparation-status="preparationIndicator.state"',
    );
    expect(appSource).toContain(':separation-controller="separationQueue"');
    expect(appSource).not.toContain('SeparationToolbarPopover');
    expect(appSource).not.toContain('RIGHT_DOCK_SURFACE_SEPARATION');
    expect(appSource).toContain('RIGHT_DOCK_SURFACE_PREPARATION');

    const playerStart = appSource.indexOf('<PlayerBar');
    const playerEnd = appSource.indexOf('/>', playerStart);
    const playerMarkup = appSource.slice(playerStart, playerEnd);
    expect(playerMarkup).not.toContain('separation-expanded');
    expect(playerMarkup).not.toContain('separation-controls');
    expect(playerMarkup).not.toContain('separation-activate');
  });
});
