import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./LibraryBrowseContent.vue', import.meta.url),
  'utf8',
);

describe('LibraryBrowseContent artist identity workflow', () => {
  it('searches a track by every canonical and credited artist form', () => {
    expect(source).toMatch(
      /import\s*\{[\s\S]*?artistSearchTexts[\s\S]*?\}\s*from '\.\.\/\.\.\/utils\/artistPage\.js'/u,
    );
    expect(source).toMatch(
      /function matchesSearch\(track\)[\s\S]*?artistSearchTexts\(track, artistIndexState\.index\)/u,
    );
  });

  it('opens the identity controller from the artist page menu', () => {
    expect(source).toContain(
      "import LibraryArtistIdentityController from './LibraryArtistIdentityController.vue'",
    );
    expect(source).toContain("label: '整理藝人'");
    expect(source).toContain('ARTIST_IDENTITY_ACTIONS.manage');
    expect(source).not.toContain('artist-identity-divider');
    expect(source).toContain('<LibraryArtistIdentityController');
    expect(source).toContain(':artist-id="artistPage?.id ?? \'\'"');
    expect(source).toContain('@close="artistIdentityOpen = false"');
    expect(source).not.toContain('handleArtistCatalogSearch');
    expect(source).not.toContain('handleArtistMerge');
  });
});
