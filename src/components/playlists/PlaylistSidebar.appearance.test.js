import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./PlaylistSidebar.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./PlaylistSidebarRow.vue', import.meta.url),
  'utf8',
);

describe('PlaylistSidebar compact-to-expanded stability', () => {
  it('keeps toolbar chrome fixed while only the collection list owns scrolling', () => {
    expect(source).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue'",
    );
    expect(source).toContain('class="playlist-sidebar__scroll"');
    expect(source).toContain('class="playlist-sidebar__list"');
    expect(source).toContain(
      ":scrollbar-visibility=\"compact ? 'hidden' : 'auto'\"",
    );
    expect(source.indexOf('class="playlist-sidebar__toolbar"')).toBeLessThan(
      source.indexOf('<UiScrollLayout'),
    );
    expect(source.indexOf('<UiScrollLayout')).toBeLessThan(
      source.indexOf('class="playlist-sidebar__item"'),
    );
    for (const [layoutRole, featureRole] of [
      ['block-start', 'list-gap'],
      ['block-end', 'sidebar-padding-block'],
      ['inline-start', 'sidebar-padding-inline'],
      ['inline-end', 'row-state-surface-outset-inline'],
    ]) {
      expect(source).toMatch(
        new RegExp(
          `--ui-scroll-layout-padding-${layoutRole}:\\s*var\\(\\s*--ui-playlist-${featureRole}\\s*\\);`,
          'u',
        ),
      );
    }
    expect(source).not.toContain('playlist-sidebar__scroll-viewport');
  });

  it('assigns perimeter, sibling rhythm, and empty-state inset to their owning layers', () => {
    expect(source).toMatch(
      /\.playlist-sidebar\s*\{[^}]*padding-block-start:\s*var\(--ui-playlist-sidebar-padding-block\);/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__toolbar\s*\{[^}]*margin-inline:\s*var\(--ui-playlist-sidebar-padding-inline\);/su,
    );
    expect(source).not.toMatch(
      /\.playlist-sidebar__toolbar\s*\{[^}]*margin-block-start:/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__divider\s*\{[^}]*margin-block:\s*calc\(\s*var\(--ui-playlist-section-gap\)\s*-\s*var\(--ui-playlist-list-gap\)\s*\);[^}]*margin-inline:\s*0;/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__empty\s*\{[^}]*margin:\s*0;[^}]*padding:/su,
    );
  });

  it('keeps both toolbar anatomies mounted and fades between them with global motion tokens', () => {
    expect(source).toContain('playlist-sidebar__toolbar-expanded');
    expect(source).toContain('playlist-sidebar__toolbar-action--compact');
    expect(source).toContain(
      'var(--ui-playlist-row-padding-inline) + var(--ui-border-width)',
    );
    expect(source).toMatch(
      /\.playlist-sidebar__toolbar-expanded,[\s\S]*?\.playlist-sidebar__toolbar-action--compact\s*\{[^}]*transition:[^}]*var\(--ui-motion-duration-fast\)[^}]*var\(--ui-motion-easing-exit\)/u,
    );
    expect(source).toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__toolbar-expanded\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/u,
    );
    expect(source).toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__toolbar-action--compact\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/u,
    );
  });

  it('keeps row copy mounted and fades it without display-none layout churn', () => {
    expect(source).toMatch(
      /\.playlist-sidebar__info\s*\{[^}]*transition:[^}]*opacity\s+var\(--ui-motion-duration-standard\)\s+var\(--ui-motion-easing-enter\)/u,
    );
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row__info\s*\{[^}]*transition:[^}]*opacity\s+var\(--ui-motion-duration-standard\)\s+var\(--ui-motion-easing-enter\)/u,
    );
    expect(source).not.toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar__info\s*\{[^}]*display:\s*none;/u,
    );
    expect(rowSource).not.toMatch(
      /@container \(width < 256px\)[\s\S]*?\.playlist-sidebar-row__info\s*\{[^}]*display:\s*none;/u,
    );
  });

  it('removes motion for both manual and OS reduced-motion preferences', () => {
    for (const componentSource of [source, rowSource]) {
      expect(componentSource).toContain("data-ui-motion='reduced'");
      expect(componentSource).toContain('prefers-reduced-motion: reduce');
    }
  });

  it('keeps row content aligned while expanding the hover and selected surface only', () => {
    expect(source).toContain('playlist-sidebar__item-state-surface');
    expect(rowSource).toContain('playlist-sidebar-row__state-surface');
    for (const componentSource of [source, rowSource]) {
      expect(componentSource).toContain(
        'var(--ui-playlist-row-state-surface-outset-inline)',
      );
      expect(componentSource).toMatch(
        /inset-inline:\s*calc\(\s*-1\s*\*\s*var\(--ui-playlist-row-state-surface-outset-inline\)\s*\)/u,
      );
      expect(componentSource).toMatch(
        /@container \(width < 256px\)[\s\S]*?inset-inline:\s*0;/u,
      );
    }
  });

  it('uses the shared side-panel radius and background-only hover recipe', () => {
    for (const componentSource of [source, rowSource]) {
      expect(componentSource).toContain(
        'border-radius: var(--ui-side-panel-row-radius);',
      );
    }
    expect(source).toMatch(
      /\.playlist-sidebar__item:hover \.playlist-sidebar__item-state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row:hover \.playlist-sidebar-row__state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-hover\);/su,
    );
    expect(source).not.toMatch(
      /\.playlist-sidebar__item:hover \.playlist-sidebar__item-state-surface\s*\{[^}]*border-color:/su,
    );
    expect(rowSource).not.toMatch(
      /\.playlist-sidebar-row:hover \.playlist-sidebar-row__state-surface\s*\{[^}]*border-color:/su,
    );
    expect(source).toMatch(
      /\.playlist-sidebar__item:active \.playlist-sidebar__item-state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/su,
    );
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row:has\(\.playlist-sidebar-row__select:active\)\s+\.playlist-sidebar-row__state-surface\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/su,
    );
  });

  it('reveals playback from the row hover or the playback button focus without mislabeling row focus', () => {
    expect(rowSource).toMatch(
      /\.playlist-sidebar-row:hover \.playlist-sidebar-row__play,[\s\S]*?\.playlist-sidebar-row__play:focus-visible\s*\{[^}]*opacity:\s*1;/u,
    );
    expect(rowSource).not.toContain(
      '.playlist-sidebar-row__select:focus-visible\n  ~ .playlist-sidebar-row__thumb',
    );
  });
});
