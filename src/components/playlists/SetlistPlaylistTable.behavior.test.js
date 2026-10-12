import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(
  new URL('./SetlistPlaylistTable.vue', import.meta.url),
  'utf8',
);
describe('SetlistPlaylistTable compatibility adapter', () => {
  it('delegates every row and grid behavior to the canonical library table', () => {
    expect(source).toContain(
      "import TrackTable from '../track/TrackTable.vue'",
    );
    expect(source).toContain('<TrackTable');
    expect(source).toContain(':variant="variant"');
    expect(source).not.toContain('grid-template-columns');
    expect(source).not.toContain('playlist-track__action');
  });

  it('maps legacy album and artist flags to canonical variants', () => {
    expect(source).toMatch(
      /const variant = computed\(\(\) =>[\s\S]*?props\.isAlbum[\s\S]*?'album'[\s\S]*?props\.readOnly[\s\S]*?'artist'[\s\S]*?'playlist'/u,
    );
  });
});
