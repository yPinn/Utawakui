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
});
