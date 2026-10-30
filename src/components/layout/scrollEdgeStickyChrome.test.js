import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('sticky chrome owns the top scroll-edge cue', () => {
  it('casts the shared shadow from the compact bar and a stuck table header', () => {
    const bar = read('./AppFolderCompactBar.vue');
    const table = read('../track/TrackTable.vue');

    expect(bar).toMatch(
      /\.app-folder-compact-bar__surface::after\s*\{[^}]*box-shadow:\s*var\(--ui-scroll-edge-shadow-start\);/su,
    );
    expect(table).toMatch(
      /\.library-track-table__header\s*\{[^}]*container-type:\s*scroll-state;/su,
    );
    expect(table).toMatch(
      /@container scroll-state\(stuck: top\)\s*\{\s*\.library-track-table__header::after\s*\{\s*opacity:\s*1;/su,
    );
  });

  it('opts the region top edge out where that chrome sits', () => {
    expect(read('./AppFolderPage.vue')).toContain('edge-shadow="end"');
    expect(
      read('../performance-session/PerformanceSessionPlanList.vue'),
    ).toContain('edge-shadow="end"');
  });
});
