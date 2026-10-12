import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./LibraryArtistIdentityController.vue', import.meta.url),
  'utf8',
);

describe('LibraryArtistIdentityController', () => {
  it('owns the identity modal and mutation projection', () => {
    expect(source).toContain(
      "import ArtistIdentityModal from '../artists/ArtistIdentityModal.vue'",
    );
    expect(source).toContain('<ArtistIdentityModal');
    expect(source).toContain(':artist="selectedArtistIdentity"');
    expect(source).toContain('@merge="handleArtistMerge"');
    expect(source).toContain('@split="handleArtistSplit"');
    expect(source).toContain('@set-display-name="handleArtistDisplayName"');
    expect(source).toContain('@undo="handleArtistUndo"');
    expect(source).toContain('@search-catalog="handleArtistCatalogSearch"');
    expect(source).toContain('@apply-catalog="handleArtistCatalogApply"');
  });

  it('runs catalog lookup only from the modal intent and cancels it on close', () => {
    expect(source).toMatch(
      /function handleArtistCatalogSearch[\s\S]*?searchCatalog\(current\.id\)/u,
    );
    expect(source).toMatch(
      /async function handleArtistCatalogApply[\s\S]*?applyCatalogCandidate[\s\S]*?selectArtist\(result\.artistId\)/u,
    );
    expect(source).toMatch(
      /function cancelIdentityLookup[\s\S]*?cancelCatalogSearch/u,
    );
    expect(source).toMatch(
      /watch\([\s\S]*?props\.open[\s\S]*?cancelIdentityLookup/u,
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
