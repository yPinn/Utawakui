import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  new URL('./TrackMetadataModal.vue', import.meta.url),
  'utf8',
);
const setlistSource = readFileSync(
  new URL('../../views/SetlistView.vue', import.meta.url),
  'utf8',
);
const appHtml = readFileSync(
  new URL('../../../index.html', import.meta.url),
  'utf8',
);

describe('TrackMetadataModal artwork discovery contract', () => {
  it('keeps local selection and online search as peer explicit actions', () => {
    expect(modalSource).toContain('選擇圖片');
    expect(modalSource).toContain('線上搜尋');
    expect(modalSource).toContain("emit('chooseThumbnail')");
    expect(modalSource).toContain("emit('openArtworkSearch')");
  });

  it('uses separate one-search-only fields and renders explainable release candidates', () => {
    expect(modalSource).toContain('只影響本次搜尋，不會修改曲庫資訊');
    expect(modalSource).toContain('aria-label="封面搜尋歌曲名稱"');
    expect(modalSource).toContain('aria-label="封面搜尋演唱者"');
    expect(modalSource).toContain('aria-label="封面搜尋專輯"');
    expect(modalSource).toContain('candidate.releaseTitle');
    expect(modalSource).toContain('candidate.artistCredit');
    expect(modalSource).toContain('candidate.firstReleaseYear');
    expect(modalSource).toContain('candidate.primaryType');
    expect(modalSource).toContain('candidate.secondaryTypes');
    expect(modalSource).toContain('confidenceLabel(candidate.confidence)');
    expect(modalSource).toContain('reasonLabel(reason)');
    expect(modalSource).toContain('查看 MusicBrainz');
  });

  it('requires an explicit selection and apply action without automatic writes', () => {
    expect(modalSource).toContain('role="radio"');
    expect(modalSource).toContain(':aria-checked="');
    expect(modalSource).toContain(
      "emit('selectArtworkCandidate', candidate.id)",
    );
    expect(modalSource).toContain('套用所選封面');
    expect(modalSource).toMatch(
      /:disabled="[^"]*!selectedArtworkCandidateId[^"]*"/u,
    );
    expect(modalSource).toContain("emit('applyArtwork')");
    expect(modalSource).not.toMatch(/watch\([^)]*candidate[^)]*apply/iu);
  });

  it('allows locally-created blob URLs without permitting remote artwork hotlinks', () => {
    expect(appHtml).toMatch(/img-src [^;]*\bblob:/u);
    expect(appHtml).not.toMatch(/img-src [^;]*https:\/\/archive\.org/u);
    expect(appHtml).not.toMatch(/img-src [^;]*https:\/\/coverartarchive\.org/u);
  });

  it('wires every search intent through the editor composable', () => {
    for (const binding of [
      ':artwork-search-open="trackMetadataEditor.state.artworkSearchOpen"',
      ':artwork-query="trackMetadataEditor.state.artworkQuery"',
      ':artwork-candidates="trackMetadataEditor.state.artworkCandidates"',
      '@open-artwork-search="trackMetadataEditor.openArtworkSearch"',
      '@search-artwork="trackMetadataEditor.searchArtwork"',
      '@apply-artwork="trackMetadataEditor.applySelectedArtwork"',
    ]) {
      expect(setlistSource).toContain(binding);
    }
  });
});
