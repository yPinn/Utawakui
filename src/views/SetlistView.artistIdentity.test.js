import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SetlistView.vue', import.meta.url),
  'utf8',
);

describe('SetlistView artist identity workflow', () => {
  it('searches a track by every canonical and credited artist form', () => {
    expect(source).toMatch(
      /import\s*\{[\s\S]*?artistSearchTexts[\s\S]*?\}\s*from '\.\.\/utils\/artistPage\.js'/u,
    );
    expect(source).toMatch(
      /function matchesSearch\(track\)[\s\S]*?artistSearchTexts\(track, artistIndexState\.index\)/u,
    );
  });

  it('opens the identity modal from the artist page menu and keeps mutations in the composable', () => {
    expect(source).toContain(
      "import ArtistIdentityModal from '../components/artists/ArtistIdentityModal.vue'",
    );
    expect(source).toContain("label: '整理藝人'");
    expect(source).toContain('ARTIST_IDENTITY_ACTIONS.manage');
    expect(source).not.toContain('artist-identity-divider');
    expect(source).toContain('<ArtistIdentityModal');
    expect(source).toContain(':artist="selectedArtistIdentity"');
    expect(source).toContain('@merge="handleArtistMerge"');
    expect(source).toContain('@split="handleArtistSplit"');
    expect(source).toContain('@set-display-name="handleArtistDisplayName"');
    expect(source).toContain('@undo="handleArtistUndo"');
    expect(source).toContain('@search-catalog="handleArtistCatalogSearch"');
    expect(source).toContain('@apply-catalog="handleArtistCatalogApply"');
    expect(source).toContain(
      ':catalog-candidates="artistIndexState.identityLookup.candidates"',
    );
  });

  it('runs MusicBrainz only from the modal intent and repairs selection after apply', () => {
    expect(source).toMatch(
      /function handleArtistCatalogSearch[\s\S]*?searchCatalog\(current\.id\)/u,
    );
    expect(source).toMatch(
      /async function handleArtistCatalogApply[\s\S]*?applyCatalogCandidate[\s\S]*?selectArtist\(result\.artistId\)/u,
    );
    expect(source).toMatch(
      /function closeArtistIdentity[\s\S]*?cancelCatalogSearch/u,
    );
  });

  it('confirms identity-changing merge and split operations', () => {
    expect(source).toMatch(
      /async function handleArtistMerge[\s\S]*?confirmAction\(\{[\s\S]*?title: '合併藝人？'[\s\S]*?mergeArtists/u,
    );
    expect(source).toMatch(
      /async function handleArtistSplit[\s\S]*?confirmAction\(\{[\s\S]*?title: '拆分藝人標示？'[\s\S]*?splitArtistCredit/u,
    );
  });

  it('repairs the selected artist after merge, display rename, split, and undo', () => {
    expect(source).toMatch(
      /async function handleArtistMerge[\s\S]*?selectArtist\(result\.artistId\)/u,
    );
    expect(source).toMatch(
      /async function handleArtistDisplayName[\s\S]*?selectArtist\(result\.artistId\)/u,
    );
    expect(source).toMatch(
      /async function handleArtistSplit[\s\S]*?selectArtist\(result\.artistId\)/u,
    );
    expect(source).toMatch(
      /async function handleArtistUndo[\s\S]*?trackArtistIds[\s\S]*?selectArtist\(fallbackArtistId\)/u,
    );
  });
});
