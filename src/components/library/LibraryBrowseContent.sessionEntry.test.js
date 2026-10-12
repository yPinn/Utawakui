import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./LibraryBrowseContent.vue', import.meta.url),
  'utf8',
);
const performanceSource = readFileSync(
  new URL('../performance/PerformanceWorkspace.vue', import.meta.url),
  'utf8',
);
const headerSource = readFileSync(
  new URL('./LibraryCollectionHeader.vue', import.meta.url),
  'utf8',
);

describe('Setlist performance-session entry', () => {
  it('moves the shared workspace coordinator to Performance composition', () => {
    expect(viewSource).not.toContain('usePerformanceSessionWorkspace');
    expect(viewSource).not.toContain(
      'performanceSessionWorkspace.isOpen.value',
    );
    expect(performanceSource).toContain('usePerformanceSessionWorkspace');
    expect(performanceSource).toContain('@close="sessionWorkspace.close"');
    expect(viewSource).not.toContain('const isPreparingSession');
  });

  it('removes the duplicate generic entry from library and collection headers', () => {
    expect(viewSource).not.toContain('prepareSelectedPlaylist');
    expect(viewSource).not.toContain('openCurrentSessionPreparation');
    expect(viewSource).not.toContain('initializePerformanceSessionPlan');
    expect(viewSource).not.toContain('@prepare=');
    expect(headerSource).not.toContain("'prepare'");
    expect(headerSource).not.toContain('場次準備');
  });
});
