import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
const tabsPath = resolve(srcRoot, 'components/ui/UiTabs.vue');
const retiredOutputTabsPath = resolve(
  srcRoot,
  'components/output/ObsOutputTabs.vue',
);

function readSource(path) {
  return readFileSync(resolve(srcRoot, path), 'utf8');
}

function vueFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return vueFiles(path);
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : [];
  });
}

describe('UiTabs adoption contract', () => {
  it('keeps raw tab semantics inside the shared primitive only', () => {
    const violations = vueFiles(srcRoot)
      .filter((path) => path !== tabsPath)
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return /role=["']tablist["']|role=["']tab["']/u.test(source);
      })
      .map((path) => relative(srcRoot, path));

    expect(violations).toEqual([]);
  });

  it('uses UiTabs for true tabpanels and segmented controls for choices', () => {
    for (const path of [
      'components/output/ObsOutputWorkspace.vue',
      'components/output/ObsTemplateGallery.vue',
      'components/playback/PlayerToolsPanel.vue',
      'components/queue/QueuePanel.vue',
      'views/VisualSystemView.vue',
    ]) {
      expect(readSource(path), path).toContain('<UiTabs');
    }

    for (const path of [
      'components/output/ObsSlotWorkbench.vue',
      'components/internal-tools/InternalToolsNavigation.vue',
      'components/lyrics-provider/LyricsProviderReviewStrata.vue',
    ]) {
      const source = readSource(path);
      expect(source, path).toContain('<UiSegmentedControl');
      expect(source, path).not.toContain('<UiTabs');
    }

    expect(existsSync(retiredOutputTabsPath)).toBe(false);
  });
});
