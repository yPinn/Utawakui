import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('scroll-edge cue scope', () => {
  it('keeps the Folder main area flat without reaching sibling overlay hosts', () => {
    expect(read('./AppFolderPage.vue')).toMatch(
      /\.app-folder-page\s*\{[^}]*--ui-scroll-edge-shadow-start:\s*none;[^}]*--ui-scroll-edge-shadow-end:\s*none;/su,
    );
    expect(read('./AppFolderCompactBar.vue')).not.toContain(
      '--ui-scroll-edge-shadow',
    );
  });

  it('lets a stuck table header cast the top cue in panels outside Folder', () => {
    const table = read('../track/TrackTable.vue');
    expect(table).toMatch(
      /\.library-track-table__header\s*\{[^}]*container-type:\s*scroll-state;/su,
    );
    expect(table).toMatch(
      /@container scroll-state\(stuck: top\)\s*\{\s*\.library-track-table__header::after\s*\{\s*opacity:\s*1;/su,
    );
    expect(
      read('../performance-session/PerformanceSessionPlanList.vue'),
    ).toContain('edge-shadow="end"');
  });

  it('slides a pushed-up table header under the compact bar', () => {
    expect(read('../track/TrackTable.vue')).toMatch(
      /\.library-track-table\s*\{[^}]*isolation:\s*isolate;/su,
    );
  });
});
