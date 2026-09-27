import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AppPlaylistSidebar resize handle', () => {
  it('exposes the bidirectional double-click toggle on the draggable axis', () => {
    const source = readFileSync(
      new URL('./AppPlaylistSidebar.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('aria-label="調整側欄寬度，雙擊切換摺疊"');
    expect(source).toContain('@dblclick="toggleSidebarCollapse"');
  });
});
