import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderNoteReaderModal from './AppFolderNoteReaderModal.vue';

const source = readFileSync(
  new URL('./AppFolderNoteReaderModal.vue', import.meta.url),
  'utf8',
);

function render(note) {
  return renderToString(
    createSSRApp({
      render: () => h(AppFolderNoteReaderModal, { open: true, note }),
    }),
  );
}

describe('AppFolderNoteReaderModal', () => {
  it('reads the note on a sheet of its own paper', async () => {
    const html = await render({
      key: 'note:1',
      title: '演出前提醒',
      text: '第二段副歌前換氣。\n安可接最後一首。',
      paper: 'rose',
    });
    expect(html).toContain('data-paper="rose"');
    expect(html).toMatch(/<h4[^>]*>\s*演出前提醒\s*<\/h4>/u);
    expect(html).toContain('第二段副歌前換氣。');
    // A single page needs no pager.
    expect(html).not.toContain('app-folder-note-reader__pager');
    expect(source).toContain('presentation="media"');
    // Notes on the page stay translucent; the reading sheet is solid.
    expect(source).toContain('material="solid"');
    expect(source).not.toContain('material="translucent"');
  });

  it('keeps reading apart from editing and removal on the action rail', () => {
    expect(source.indexOf(':icon="Pencil"')).toBeLessThan(
      source.indexOf(':icon="Trash2"'),
    );
    expect(source).toContain('@click="emit(\'edit\', note.key)"');
    expect(source).toContain('@click="emit(\'remove\', note.key)"');
    expect(source).not.toContain('UiTextarea');
  });

  it('pages long text by column and turns pages from the corner or keys', () => {
    expect(source).toMatch(
      /\.app-folder-note-reader__pages \{[^}]*columns: 1;[^}]*column-fill: auto;[^}]*translateX\(/su,
    );
    // Each page repaints ruled lines from its own top at the rule pitch.
    expect(source).toMatch(
      /\.app-folder-note-reader__text \{[^}]*background-image: var\(--ui-folder-artifact-note-print, none\);[^}]*box-decoration-break: clone;[^}]*--ui-folder-artifact-note-line-height/su,
    );
    expect(source).toContain("new Set(['ArrowLeft', 'PageUp'])");
    expect(source).toContain("new Set(['ArrowRight', 'PageDown'])");
    // Keys typed into the editor stacked above never turn pages.
    expect(source).toMatch(
      /event\.target\?\.closest\?\.\('input, textarea, select, \[contenteditable="true"\]'\)/u,
    );
    expect(source).toMatch(
      /\.app-folder-note-reader \{[^}]*var\(--ui-folder-note-reader-width\)[^}]*var\(--ui-folder-note-reader-aspect\)/su,
    );
  });
});
