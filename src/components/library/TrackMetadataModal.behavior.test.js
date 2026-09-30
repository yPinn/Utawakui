import { readFileSync } from 'node:fs';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  new URL('./TrackMetadataModal.vue', import.meta.url),
  'utf8',
);
const setlistSource = readFileSync(
  new URL('../../views/SetlistView.vue', import.meta.url),
  'utf8',
);
const queueSource = readFileSync(
  new URL('../queue/QueuePanel.vue', import.meta.url),
  'utf8',
);
const appHtml = readFileSync(
  new URL('../../../index.html', import.meta.url),
  'utf8',
);

describe('TrackMetadataModal artwork discovery contract', () => {
  it('uses explicit sibling default and footer slots that compile together', () => {
    expect(modalSource).toContain('<template #default>');
    expect(modalSource).toMatch(
      /<template #default>[\s\S]*<\/template>\s*<template #footer>/u,
    );

    const filename = 'TrackMetadataModal.vue';
    const { descriptor, errors: parseErrors } = parse(modalSource, {
      filename,
    });
    const script = compileScript(descriptor, { id: filename });
    const compiled = compileTemplate({
      id: filename,
      filename,
      source: descriptor.template.content,
      compilerOptions: { bindingMetadata: script.bindings },
    });

    expect(parseErrors).toEqual([]);
    expect(compiled.errors).toEqual([]);
  });

  it('uses an image-first split workspace with a fixed-height body and separate footer', () => {
    expect(modalSource).toContain('ArtworkPreviewPane');
    expect(modalSource).toContain('ArtworkSearchResults');
    expect(modalSource).toContain('size="wide"');
    expect(modalSource).toContain('fixed-height');
    expect(modalSource).toMatch(
      /grid-template-columns:\s*minmax\([^;]+\)\s+minmax\(0,\s*1fr\)/u,
    );
    expect(modalSource).toMatch(
      /\.track-metadata__preview\s*\{[^}]*position:\s*sticky/msu,
    );
    expect(modalSource).toContain('<template #footer>');
    expect(modalSource).not.toMatch(
      /\.track-metadata__actions\s*\{[^}]*position:\s*sticky/msu,
    );
  });

  it('uses one title and artist entry for metadata and search', () => {
    expect(modalSource).toContain('UiTextField');
    expect(modalSource).toContain('id="track-metadata-title"');
    expect(modalSource).toContain('id="track-metadata-artist"');
    expect(modalSource).toContain('id="track-artwork-album-filter"');
    expect(modalSource).not.toContain('封面搜尋歌曲名稱');
    expect(modalSource).not.toContain('封面搜尋演唱者');
    expect(modalSource).toContain('SlidersHorizontal');
    expect(modalSource).toContain('ChevronUp');
    expect(modalSource).toContain('設定專輯篩選');
    expect(modalSource).toContain('使用外部來源搜尋；套用前不會更換封面。');
    expect(modalSource).not.toContain('<details');
    expect(modalSource).not.toContain('UiDisclosure');
  });

  it('keeps search actions concise and does not navigate away from the modal', () => {
    expect(modalSource).toContain('UiIconButton');
    expect(modalSource).toMatch(/>\s*搜尋\s*</u);
    expect(modalSource).not.toMatch(/>\s*搜尋封面\s*</u);
    expect(modalSource).not.toContain('openArtworkSource');
    expect(modalSource).not.toContain('@open-source');
    expect(setlistSource).not.toContain('@open-artwork-source');
    expect(queueSource).not.toContain('@open-artwork-source');
  });

  it('requires an explicit selection and apply action without automatic writes', () => {
    expect(modalSource).toContain(':selected-id="selectedArtworkCandidateId"');
    expect(modalSource).toContain(
      '@select="emit(\'selectArtworkCandidate\', $event)"',
    );
    expect(modalSource).toContain(':candidate="selectedArtworkCandidate"');
    expect(modalSource).toContain('@apply="emit(\'applyArtwork\')"');
    expect(modalSource).toContain("emit('applyArtwork')");
    expect(modalSource).not.toMatch(/watch\([^)]*candidate[^)]*apply/iu);
  });

  it('names the footer action for metadata instead of implying a staged artwork transaction', () => {
    expect(modalSource).toContain('儲存歌曲資料');
    expect(modalSource).not.toContain('儲存變更');
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
