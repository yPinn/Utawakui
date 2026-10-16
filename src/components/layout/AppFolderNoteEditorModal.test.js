import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderNoteEditorModal from './AppFolderNoteEditorModal.vue';

const source = readFileSync(
  new URL('./AppFolderNoteEditorModal.vue', import.meta.url),
  'utf8',
);

function render(props) {
  return renderToString(
    createSSRApp({
      render: () => h(AppFolderNoteEditorModal, { open: true, ...props }),
    }),
  );
}

function rule(selector) {
  const start = source.indexOf(`${selector} {`);
  return start < 0 ? '' : source.slice(start, source.indexOf('}', start));
}

describe('AppFolderNoteEditorModal', () => {
  it('names the create and edit modes and seeds the drafts', async () => {
    const created = await render({ mode: 'create' });
    const edited = await render({
      mode: 'edit',
      title: '安可',
      text: '最後一首',
      paper: 'rose',
    });

    expect(created).toContain('新增便條');
    expect(created).toContain('右下角可切換紙色；標題可留空。');
    // A new note starts on one of the user stocks, never the derived tissue.
    expect(created).toMatch(
      /data-paper="(periwinkle|rose|canary|kraft|ruled)"/u,
    );
    expect(edited).toContain('編輯便條');
    expect(edited).toContain('value="安可"');
    expect(edited).toContain('最後一首');
    expect(edited).toContain('data-paper="rose"');
    expect(edited).toContain('切換紙色（目前：粉紅）');
  });

  it('cannot save an empty note', async () => {
    const empty = await render({ mode: 'create' });
    const saveButton = empty.match(/<button[^>]*>(?:(?!<button)[\s\S])*?儲存/u);
    expect(saveButton?.[0]).toContain('disabled');
    expect(source).toMatch(
      /canSave = computed\([\s\S]*?titleDraft\.value\.trim\(\) !== '' \|\| textDraft\.value\.trim\(\) !== ''/u,
    );
  });

  it('shares the playlist details anatomy with the footnote on the action row', () => {
    const footer = source.slice(source.indexOf('<template #footer>'));
    expect(footer).toMatch(
      /<UiHint class="app-folder-note-editor__footnote">[\s\S]*?<UiButton[^>]*variant="secondary"[\s\S]*?<UiButton[^>]*variant="accent"/u,
    );
    expect(rule('.app-folder-note-editor__footnote')).toContain(
      'margin-inline-end: auto;',
    );
    expect(rule('.app-folder-note-editor__fields')).toContain(
      'grid-template-rows: auto minmax(calc(var(--ui-field-height) * 2), 1fr);',
    );
    expect(rule('.app-folder-note-editor__fields')).toContain(
      'min-block-size: var(--app-folder-note-editor-preview-size);',
    );
    expect(source).toContain('const NOTE_PREVIEW_SIZE = 160;');
  });

  it('commits trimmed content only on Save', () => {
    expect(source).toMatch(
      /emit\('save', \{\s*title: titleDraft\.value\.trim\(\),\s*text: textDraft\.value\.trimEnd\(\),\s*paper: paperDraft\.value\.id,\s*\}\)/u,
    );
    expect(source).toContain('@keydown.enter="save"');
    expect(source).toContain(':maxlength="NOTE_TITLE_MAX_LENGTH"');
  });

  it('picks the paper with the shared overlay icon button, cycling stocks', () => {
    expect(source).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue'",
    );
    expect(source).toContain(':icon="Palette"');
    expect(source).toContain('variant="overlay"');
    expect(source).toContain('@click="cyclePaper"');
    expect(source).not.toMatch(/<button\b/u);
    // The stock list and its cycle are shared with the photo caption editor.
    expect(source).toContain(
      'paperIndex.value = nextNotePaperIndex(paperIndex.value);',
    );
    expect(source).toContain("from '../../utils/notePapers.js'");
  });
});
