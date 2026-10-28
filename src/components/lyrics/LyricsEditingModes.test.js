import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
describe('minimal lyrics authoring entry points', () => {
  it('keeps display in a popover and editing in one action menu, not permanent mode tabs', () => {
    const header = read('./LyricsWorkspaceHeader.vue');
    expect(header).toContain('<AppFolderWorkspaceToolbar');
    expect(header).toContain('<UiPopover');
    expect(header).toContain('<UiActionMenu');
    expect(header).not.toContain('SeparationPresetControl');
    expect(header).not.toContain('<UiSegmentedControl');
    expect(header).toContain("label: '修正讀音'");
    expect(header).toContain("label: '調整對時'");
    expect(header).toContain("label: '選擇曲目'");
    expect(header).toContain("label: '重新掃描歌詞'");
  });
  it('shows only the current editing task and protects drafts from replacement', () => {
    const source = read('./LyricsAuthoringWorkspace.vue');
    expect(source).toContain('hasEditingDraft');
    expect(source).toContain("editMode === 'timing'");
    expect(source).toContain("editMode === 'reading'");
    expect(source).not.toContain('useSeparation');
    expect(source).toContain('結束編輯');
  });
  it('reuses a labelled shared field and prevents duplicate reading saves', () => {
    const source = read('./LyricsDocumentPanel.vue');
    expect(source).toContain('<UiTextField');
    expect(source).not.toContain('<input');
    expect(source).toContain(':loading="isSavingReading"');
  });
});
