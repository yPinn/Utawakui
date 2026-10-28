import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AppPlaylistSidebar shell', () => {
  const source = readFileSync(
    new URL('./AppPlaylistSidebar.vue', import.meta.url),
    'utf8',
  );

  it('keeps the original boundary separator for two-state pointer and keyboard disclosure', () => {
    expect(source).toContain('data-sidebar-disclosure');
    expect(source).toContain(':aria-expanded="props.expanded"');
    expect(source).toContain('aria-controls="app-playlist-sidebar-content"');
    expect(source).toContain('role="separator"');
    expect(source).toContain('@pointerdown="startResize"');
    expect(source).toContain('@keydown="handleResizeKeydown"');
    expect(source).toContain('@dblclick=');
    expect(source).toContain('col-resize');
    expect(source).not.toContain('<UiIconButton');
    expect(source).not.toContain('app-playlist-sidebar__disclosure');
  });

  it('delegates collection scrolling and leaves the handle outside that owner', () => {
    expect(source).not.toContain('import UiScrollRegion');
    expect(source).not.toContain('<UiScrollRegion');
    expect(source.indexOf('<PlaylistSidebar')).toBeLessThan(
      source.indexOf('class="app-playlist-sidebar__handle"'),
    );
  });

  it('does not own or forward the shell Import action', () => {
    expect(source).not.toContain("defineEmits(['openImport'])");
    expect(source).not.toContain('@import-tracks');
  });

  it('uses the Shell projection for compact interactions and activates the library directly', () => {
    expect(source).toContain(':compact="!props.expanded"');
    expect(source).toContain('@activate-library="openLibraryContent"');
    expect(source).not.toContain("emit('navigate')");
  });

  it('draws a complete inset panel stroke without changing container-query geometry', () => {
    expect(source).toContain(
      'box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-border);',
    );
    expect(source).not.toContain('inset calc(-1 * var(--ui-border-width)) 0 0');
  });
});
