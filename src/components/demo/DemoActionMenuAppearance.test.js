import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
const readSource = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const layerSource = readSource('./DemoActionMenuLayer.vue');
describe('F8 action-menu comparison', () => {
  it('uses the proper shared trigger primitive and keeps menu item primitives internal', () => {
    expect(layerSource).toContain(
      "import UiActionMenu from '../ui/UiActionMenu.vue'",
    );
    expect(layerSource).toContain("kind: 'filterable-actions'");
    expect(layerSource).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue'",
    );
    expect(layerSource).toContain(':icon="Ellipsis"');
    expect(layerSource).not.toContain('<UiButton class="demo-action-menu-item');
    expect(layerSource).not.toContain('<UiChip');
    expect(layerSource).not.toContain('<UiMarqueeText');
  });
});
