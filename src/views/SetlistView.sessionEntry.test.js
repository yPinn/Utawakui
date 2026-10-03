import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./SetlistView.vue', import.meta.url),
  'utf8',
);
const headerSource = readFileSync(
  new URL('../components/playlists/SetlistPlaylistHeader.vue', import.meta.url),
  'utf8',
);

describe('Setlist performance-session entry', () => {
  it('uses the shared workspace coordinator instead of local navigation state', () => {
    expect(viewSource).toContain('usePerformanceSessionWorkspace');
    expect(viewSource).toContain('performanceSessionWorkspace.isOpen.value');
    expect(viewSource).toContain('@close="performanceSessionWorkspace.close"');
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
