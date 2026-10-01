import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AppPlaylistSidebar shell', () => {
  const source = readFileSync(
    new URL('./AppPlaylistSidebar.vue', import.meta.url),
    'utf8',
  );

  it('exposes the bidirectional double-click toggle on the draggable axis', () => {
    expect(source).toContain('role="separator"');
    expect(source).toContain('tabindex="0"');
    expect(source).toContain('aria-orientation="vertical"');
    expect(source).toContain(':aria-valuemin="SIDEBAR_WIDTH_MIN"');
    expect(source).toContain(':aria-valuemax="SIDEBAR_WIDTH_MAX"');
    expect(source).toContain(':aria-valuenow="sidebarWidth"');
    expect(source).toContain(':aria-expanded="!sidebarCompact"');
    expect(source).toContain('@dblclick="toggleSidebarCollapse"');
    expect(source).toContain('@keydown="handleResizeKeydown"');
  });

  it('delegates collection scrolling to PlaylistSidebar and keeps resize outside that owner', () => {
    expect(source).not.toContain('import UiScrollRegion');
    expect(source).not.toContain('<UiScrollRegion');
    expect(source).not.toContain('app-playlist-sidebar__scroll-viewport');
    expect(source.indexOf('<PlaylistSidebar')).toBeLessThan(
      source.indexOf('class="app-playlist-sidebar__handle"'),
    );
  });

  it('derives the collection interaction mode from the shell-owned sidebar width', () => {
    expect(source).toContain('SIDEBAR_COMPACT_THRESHOLD');
    expect(source).toContain('const sidebarCompact = computed(');
    expect(source).toContain(':compact="sidebarCompact"');
  });

  it('draws a complete inset panel stroke without changing container-query geometry', () => {
    expect(source).toContain(
      'box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-border);',
    );
    expect(source).not.toContain('inset calc(-1 * var(--ui-border-width)) 0 0');
  });

  it('uses the shared resize hit area without covering the visible scrollbar thumb', () => {
    expect(source).toContain('inline-size: var(--ui-resize-handle-hit-size);');
    expect(source).toMatch(
      /inset-inline-end:\s*calc\(\s*\(\s*var\(--ui-resize-handle-hit-size\)\s*-\s*var\(--ui-scrollbar-thumb-inset\)\s*\)\s*\/\s*-1\s*\);/su,
    );
    expect(source).not.toContain('width: 6px;');
  });
});
