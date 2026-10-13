import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const textFieldSource = fs.readFileSync(
  new URL('./UiTextField.vue', import.meta.url),
  'utf8',
);
const folderEditorSource = fs.readFileSync(
  new URL('../layout/AppFolderNoteEditorModal.vue', import.meta.url),
  'utf8',
);
const playlistEditorSource = fs.readFileSync(
  new URL('../playlists/PlaylistDetailsModal.vue', import.meta.url),
  'utf8',
);

describe('UiTextField appearance ownership', () => {
  it('uses the shared field-value recipe for its default text', () => {
    expect(textFieldSource).toMatch(
      /\.ui-text-field\s*\{[^}]*font-size:\s*var\(--ui-field-font-size\);[^}]*font-weight:\s*var\(--ui-field-font-weight\);[^}]*line-height:\s*var\(--ui-field-line-height\);/s,
    );
  });

  it('owns the semantic title recipe as a bounded text role', () => {
    expect(textFieldSource).toMatch(
      /\.ui-text-field--title\s*\{[^}]*font-size:\s*var\(--ui-type-title-size\);[^}]*font-weight:\s*var\(--ui-type-title-weight\);[^}]*line-height:\s*var\(--ui-type-title-line-height\);/s,
    );
  });

  it('keeps title editors on the public role instead of deep anatomy overrides', () => {
    for (const source of [folderEditorSource, playlistEditorSource]) {
      expect(source).toContain('text-role="title"');
      expect(source).not.toContain(':deep(.ui-text-field)');
    }
  });
});
