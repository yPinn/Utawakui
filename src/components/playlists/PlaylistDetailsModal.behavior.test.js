import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  new URL('./PlaylistDetailsModal.vue', import.meta.url),
  'utf8',
);
const actionSource = readFileSync(
  new URL('../../composables/usePlaylistActions.js', import.meta.url),
  'utf8',
);
const sidebarSource = readFileSync(
  new URL('../layout/AppPlaylistSidebar.vue', import.meta.url),
  'utf8',
);

describe('PlaylistDetailsModal component contract', () => {
  it('uses formal fields and keeps the save action in the modal footer', () => {
    expect(modalSource).toMatch(/<UiModal[\s\S]*?size="notice"/u);
    expect(modalSource).toContain(
      "import UiTextField from '../ui/UiTextField.vue';",
    );
    expect(modalSource).toContain(
      "import UiTextarea from '../ui/UiTextarea.vue';",
    );
    expect(modalSource).toContain('<UiTextField');
    expect(modalSource).toContain('<UiTextarea');
    expect(modalSource).toContain('label-hidden');
    expect(modalSource).toContain('<template #footer>');
    expect(modalSource).not.toMatch(/<input\b|<textarea\b/u);
    expect(modalSource).not.toContain('playlist-details__actions');
  });

  it('keeps one feature-owned cover size source and semantic content spacing', () => {
    expect(modalSource).toContain('const PLAYLIST_DETAILS_COVER_SIZE = 160;');
    expect(modalSource).toContain(':size="PLAYLIST_DETAILS_COVER_SIZE"');
    expect(modalSource).toContain('--playlist-details-cover-size');
    expect(modalSource.match(/\b160\b/gu)).toHaveLength(1);
    expect(modalSource).toMatch(
      /\.playlist-details\s*\{[\s\S]*?gap:\s*var\(--ui-modal-section-gap\);/u,
    );
    expect(modalSource).toMatch(
      /\.playlist-details__fields\s*\{[\s\S]*?gap:\s*var\(--ui-modal-section-gap\);/u,
    );
    expect(modalSource).toContain('@container (max-width: 25.5rem)');
  });

  it('keeps a clear modal title, editable name and description hierarchy', () => {
    expect(modalSource).toMatch(
      /\.playlist-details__name-field :deep\(\.ui-text-field\)\s*\{[\s\S]*?font-size:\s*var\(--ui-font-size-lg\);[\s\S]*?font-weight:\s*var\(--ui-font-weight-semibold\);[\s\S]*?line-height:\s*var\(--ui-line-height-title\);/u,
    );
    expect(modalSource).toMatch(
      /\.playlist-details__readonly-description\s*\{[\s\S]*?font-size:\s*var\(--ui-font-size-sm\);[\s\S]*?font-weight:\s*var\(--ui-font-weight-regular\);[\s\S]*?line-height:\s*var\(--ui-line-height-body\);/u,
    );
    expect(modalSource).toMatch(
      /\.playlist-details__description-field\s*\{[\s\S]*?block-size:\s*100%;/u,
    );
    expect(modalSource).toMatch(
      /\.playlist-details__description-field :deep\(\.ui-field__main\),[\s\S]*?\.playlist-details__description-field :deep\(\.ui-field__control\),[\s\S]*?\.playlist-details__description-field :deep\(\.ui-textarea\)\s*\{[\s\S]*?block-size:\s*100%;/u,
    );
    expect(modalSource).toMatch(
      /\.playlist-details__description-field :deep\(\.ui-textarea\)\s*\{[\s\S]*?resize:\s*none;/u,
    );
  });

  it('preserves draft save semantics and album-specific description behavior', () => {
    expect(modalSource).toContain('name: nameDraft.value.trim() || props.name');
    expect(modalSource).toContain('description: descriptionDraft.value');
    expect(modalSource).toContain('@keydown.enter="save"');
    expect(modalSource).toMatch(/<UiTextarea[\s\S]*?v-if="!isAlbum"/u);
    expect(modalSource).toContain('v-else-if="description"');
    expect(modalSource).toContain(':can-collage="!isAlbum"');
  });

  it('offers an explicit cancel before save and shares it with X and Escape', () => {
    const footer = modalSource.slice(modalSource.indexOf('<template #footer>'));
    const cancelIndex = footer.indexOf('取消');
    // The footnote also mentions 儲存; the Save button follows Cancel.
    const saveIndex = footer.indexOf('儲存', cancelIndex);

    expect(cancelIndex).toBeGreaterThan(-1);
    expect(saveIndex).toBeGreaterThan(cancelIndex);
    expect(footer).toMatch(
      /<UiButton[^>]*variant="secondary"[^>]*@click="cancel"[^>]*>\s*取消/u,
    );
    expect(modalSource).toContain('@close="cancel"');
    expect(modalSource).toContain(':close-disabled="saving"');
    expect(modalSource).toContain(':disabled="saving"');
  });

  it('states the immediate cover boundary and keeps one saving owner around playlist writes', () => {
    const footer = modalSource.slice(modalSource.indexOf('<template #footer>'));
    expect(footer).toMatch(
      /<UiHint[^>]*class="playlist-details__footnote"[^>]*>\s*封面立即套用；名稱與說明需按儲存。/u,
    );
    // The fields column holds only name and description, so the textarea's
    // 1fr track reaches the cover's bottom edge.
    const fields = modalSource.slice(
      modalSource.indexOf('class="playlist-details__fields"'),
      modalSource.indexOf('<template #footer>'),
    );
    expect(fields).not.toContain('<UiHint');
    expect(actionSource).toContain('editDetailsIsSaving');
    expect(actionSource).toContain('if (editDetailsIsSaving.value) return;');
    expect(sidebarSource).toContain(':saving="editDetailsIsSaving"');
  });
});
