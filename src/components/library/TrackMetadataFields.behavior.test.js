import { readFileSync } from 'node:fs';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  new URL('./TrackMetadataFields.vue', import.meta.url),
  'utf8',
);
const editorSource = readFileSync(
  new URL('./WorkVersionEditor.vue', import.meta.url),
  'utf8',
);
const libraryBrowseSource = readFileSync(
  new URL('./LibraryBrowseContent.vue', import.meta.url),
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

describe('TrackMetadataFields artwork discovery contract', () => {
  it('uses explicit sibling default and footer slots that compile together', () => {
    expect(modalSource).not.toContain('UiModal');
    expect(editorSource).toContain('<template #footer>');
    const filename = 'TrackMetadataFields.vue';
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

  it('uses an image-first split workspace with stable bounded geometry', () => {
    expect(modalSource).toContain('ArtworkPreviewPane');
    expect(modalSource).toContain('ArtworkSearchResults');
    expect(editorSource).toContain('size="wide"');
    expect(modalSource).toMatch(
      /grid-template-columns:\s*minmax\(var\(--ui-artwork-size-3xl\),\s*15rem\)\s+minmax\(\s*0,\s*1fr\s*\)/u,
    );
    expect(modalSource).toMatch(
      /\.track-metadata__preview\s*\{[^}]*position:\s*sticky/msu,
    );
    expect(editorSource).toContain('<template #footer>');
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
    expect(modalSource).toContain('選取後預覽，儲存後套用。');
    expect(modalSource).not.toContain('套用前');
    expect(modalSource).not.toContain('<details');
    expect(modalSource).not.toContain('UiDisclosure');
  });

  it('keeps the optional album field in an in-flow search row below the toolbar', () => {
    const actionsIndex = modalSource.indexOf(
      'class="track-metadata__search-actions"',
    );
    const queryIndex = modalSource.indexOf('id="track-artwork-search-options"');
    const resultsIndex = modalSource.indexOf('<ArtworkSearchResults');

    expect(modalSource).toContain('role="search"');
    expect(modalSource).toContain('aria-label="專輯篩選"');
    expect(modalSource).toContain(':aria-expanded="searchOptionsOpen"');
    expect(modalSource).not.toContain('aria-haspopup="dialog"');
    expect(modalSource).toContain('label-hidden');
    expect(modalSource).toContain('label="以專輯條件搜尋"');
    expect(modalSource).toContain('label="關閉專輯篩選"');
    expect(queryIndex).toBeGreaterThan(actionsIndex);
    expect(resultsIndex).toBeGreaterThan(queryIndex);
    expect(modalSource).not.toMatch(
      /\.track-metadata__search-options\s*\{[^}]*position:\s*absolute/msu,
    );
    expect(modalSource).not.toContain('var(--ui-shadow-overlay)');
  });

  it('keeps search actions concise and does not navigate away from the modal', () => {
    expect(modalSource).toContain('UiIconButton');
    expect(modalSource).toMatch(/>\s*搜尋\s*</u);
    expect(modalSource).not.toMatch(
      /<UiButton[\s\S]*?>\s*搜尋封面\s*<\/UiButton>/u,
    );
    expect(modalSource).not.toContain('openArtworkSource');
    expect(modalSource).not.toContain('@open-source');
    expect(libraryBrowseSource).not.toContain('@open-artwork-source');
    expect(queueSource).not.toContain('@open-artwork-source');
  });

  it('keeps background preload from locking the metadata fields', () => {
    expect(modalSource).toContain(
      'props.readOnly || props.saving || props.artworkPreparing',
    );
    expect(modalSource).toMatch(
      /props\.readOnly\s*\|\|\s*props\.saving\s*\|\|\s*props\.artworkPreparing\s*\|\|\s*props\.artworkSearching/u,
    );
    expect(modalSource).toContain(':disabled="searchControlsDisabled"');
  });

  it('uses candidate selection as a staged cover choice without an immediate apply action', () => {
    expect(modalSource).toContain(':selected-id="selectedArtworkCandidateId"');
    expect(modalSource).toContain(
      '@select="emit(\'selectArtworkCandidate\', $event)"',
    );
    expect(modalSource).toContain(':candidate="selectedArtworkCandidate"');
    expect(modalSource).not.toContain('applyArtwork');
    expect(modalSource).not.toContain('套用這張封面');
  });

  it('uses the common workspace save and close instead of a nested modal', () => {
    expect(modalSource).not.toContain('UiModal');
    expect(modalSource).not.toContain('<template #footer>');
    expect(editorSource).toContain('@click="songEditor.save"');
    expect(editorSource).toContain('@close="songEditor.close"');
    expect(editorSource).toContain(':close-disabled="songEditor.busy.value"');
  });
  it('keeps Cancel truthful by removing the immediate artwork write disclaimer', () => {
    expect(modalSource).not.toContain('立即生效');
    expect(modalSource).not.toContain('只放棄尚未儲存');
  });

  it('associates the required-title failure with the title field', () => {
    expect(modalSource).toContain(':error="titleError"');
    expect(modalSource).toContain('ref="titleField"');
  });

  it('hands focus into and back out of progressive artwork search', () => {
    expect(modalSource).toContain('useTemplateRef');
    expect(modalSource).toContain('ref="artworkSearchHeading"');
    expect(modalSource).toContain('ref="artworkSearchTrigger"');
    expect(modalSource).toContain('focusArtworkSearch');
    expect(modalSource).toContain('restoreArtworkSearchTrigger');
  });

  it('allows locally-created blob URLs without permitting remote artwork hotlinks', () => {
    expect(appHtml).toMatch(/img-src [^;]*\bblob:/u);
    expect(appHtml).toMatch(
      /img-src [^;]*https:\/\/yt3\.googleusercontent\.com\s/u,
    );
    expect(appHtml).toMatch(
      /img-src [^;]*https:\/\/lh3\.googleusercontent\.com\s/u,
    );
    expect(appHtml).not.toMatch(/img-src [^;]*https:\/\/archive\.org/u);
    expect(appHtml).not.toMatch(/img-src [^;]*https:\/\/coverartarchive\.org/u);
  });

  it('wires every search intent through the editor composable', () => {
    for (const binding of [
      ':artwork-search-open="metadata.state.artworkSearchOpen"',
      ':artwork-query="metadata.state.artworkQuery"',
      ':artwork-candidates="metadata.state.artworkCandidates"',
      '@open-artwork-search="metadata.openArtworkSearch"',
      '@search-artwork="metadata.searchArtwork"',
    ]) {
      expect(editorSource).toContain(binding);
    }
    expect(libraryBrowseSource).not.toContain('@apply-artwork');
  });
});
