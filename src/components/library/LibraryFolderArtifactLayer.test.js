import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LibraryFolderArtifactLayer from './LibraryFolderArtifactLayer.vue';

const source = readFileSync(
  new URL('./LibraryFolderArtifactLayer.vue', import.meta.url),
  'utf8',
);

function photo(overrides = {}) {
  return {
    key: 'photo:asset-1',
    type: 'photo',
    source: 'user',
    imageUrl: 'utawakui-media://folder-asset/asset-1/image.png',
    placement: { region: 'paper', anchor: { x: 0.2, y: 0.6 } },
    rotation: -2.5,
    pinned: true,
    order: 1,
    ...overrides,
  };
}

function render(props) {
  return renderToString(
    createSSRApp({ render: () => h(LibraryFolderArtifactLayer, props) }),
  );
}

describe('LibraryFolderArtifactLayer', () => {
  it('combines the derived artist note and user photos in one folder canvas', async () => {
    const html = await render({
      summary: { artist: 'Aimer', text: 'Artist summary' },
      objects: [
        photo(),
        {
          key: 'derived:artist-summary',
          type: 'note',
          source: 'derived',
          placement: { region: 'side', anchor: { x: 0.5, y: 0.25 } },
          rotation: -1.5,
          pinned: true,
          order: 2,
        },
      ],
    });

    expect(source.match(/<UiFolderArtifactCanvas/gu)).toHaveLength(1);
    expect(html).toContain('Artist summary');
    expect(html).toContain('utawakui-media://folder-asset/asset-1/image.png');
    expect(html).toContain('--ui-folder-artifact-rotation:-2.5deg');
    expect(html).toContain('藝人資料：Aimer，已固定');
    expect(html).toContain('頁面照片，已固定，按 Enter 或空白鍵展開照片');
    expect(html.match(/--ui-folder-artifact-z:1/gu)).toHaveLength(1);
    expect(html.match(/--ui-folder-artifact-z:2/gu)).toHaveLength(1);
  });

  it('renders the derived artist summary as a label／value data card', async () => {
    const html = await render({
      summary: {
        artist: '王以太',
        trackCount: 14,
        albumCount: 1,
        yearStart: 2019,
      },
      objects: [],
    });

    expect(html).toContain('ui-folder-artifact__fields');
    expect(html).toMatch(/<dt[^>]*>曲目<\/dt><dd[^>]*>14 首<\/dd>/u);
    expect(html).toMatch(/<dt[^>]*>專輯<\/dt><dd[^>]*>1 張<\/dd>/u);
    expect(html).toMatch(/<dt[^>]*>年份<\/dt><dd[^>]*>2019<\/dd>/u);
    expect(html).toContain('藝人資料');
    expect(html).not.toContain('ui-folder-artifact--compact');
  });

  it('clips the data card and gives about one in three user objects stable stationery', async () => {
    const card = await render({
      summary: { artist: '王以太', trackCount: 14, albumCount: 1 },
      objects: [],
    });
    const clip = card.match(
      /<span[^>]*ui-folder-artifact__stationery--clip[^>]*>/u,
    )?.[0];
    expect(clip).toContain('aria-hidden="true"');

    const photos = Array.from({ length: 30 }, (_, index) =>
      photo({
        key: `photo:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      }),
    );
    const first = await render({ objects: photos });
    const second = await render({ objects: photos });
    const taped = first.match(/ui-folder-artifact__stationery--tape/gu) ?? [];

    expect(second).toBe(first);
    expect(taped.length).toBeGreaterThan(4);
    expect(taped.length).toBeLessThan(18);
    expect(first).not.toContain('data-stationery="torn"');
  });

  it('places an unsaved derived summary behind saved objects with its default pose', async () => {
    const html = await render({
      summary: { artist: 'Aimer', text: 'Artist summary' },
      objects: [photo({ pinned: false })],
    });

    const summaryIndex = html.indexOf('Artist summary');
    const photoIndex = html.indexOf('folder-asset/asset-1');
    expect(summaryIndex).toBeGreaterThan(-1);
    expect(summaryIndex).toBeLessThan(photoIndex);
    expect(html).toContain('--ui-folder-artifact-rotation:-1.5deg');
    expect(source).toMatch(
      /ARTIST_SUMMARY_PLACEMENT = Object\.freeze\(\{\s*region: 'bottom',/u,
    );
  });

  it('renders by registered object type and hides unknown or orphaned objects', async () => {
    const html = await render({
      summary: null,
      objects: [
        photo({ pinned: false }),
        {
          ...photo(),
          key: 'note:22222222-2222-4222-8222-222222222222',
          type: 'note',
          text: '安可曲備忘',
          order: 2,
        },
        { ...photo(), key: 'pdf:x', type: 'pdf', order: 3 },
        {
          key: 'derived:artist-summary',
          type: 'note',
          source: 'derived',
          placement: { region: 'paper', anchor: { x: 0, y: 0 } },
          order: 4,
        },
      ],
    });

    expect(html).toContain('安可曲備忘');
    expect(html).toContain('頁面便條');
    expect(html).not.toContain('藝人曲庫摘要');
    expect(html.match(/role="group"/gu)).toHaveLength(2);
    expect(source).toContain('const OBJECT_RENDERERS = Object.freeze({');
  });

  it('edits user notes from the context menu only and renders their title', async () => {
    const note = {
      ...photo({ pinned: false }),
      key: 'note:22222222-2222-4222-8222-222222222222',
      type: 'note',
      title: '安可',
      text: '安可曲備忘',
    };
    const html = await render({ objects: [note] });

    expect(html).not.toContain('ui-textarea');
    expect(html).not.toContain('按 Enter 或空白鍵編輯便條');
    expect(html).toMatch(/<h4[^>]*>安可<\/h4>/u);
    expect(html).toContain('頁面便條：安可');
    // A click opens a photo, or the reading sheet of a note the cap cut off;
    // it never starts an edit.
    expect(source).toMatch(
      /function handleActivate\(id\) \{\s*const item = findItem\(id\);\s*if \(item\?\.type === 'photo'\) emit\('activate', id\);\s*else if \(isReadableNote\(item\)\) emit\('readNote', id\);\s*\}/u,
    );
    expect(source).toContain('capped: true,');
    expect(source).toContain(
      "...(readable ? { activatable: true, activationLabel: '閱讀便條' } : {}),",
    );
    expect(source).toContain(
      '@overflow-change="setNoteOverflow(artifact.id, $event)"',
    );
    expect(source).toContain(
      "else if (action === 'read') emit('readNote', id);",
    );
    expect(source).toContain(
      "else if (action === 'edit') emit('editNote', id);",
    );
    expect(source).toMatch(
      /item\.type === 'photo'[\s\S]*?label: '展開照片'[\s\S]*?label: item\.type === 'photo' \? '從頁面移除' : '刪除便條'[\s\S]*?intent: 'danger'/u,
    );
    expect(source).toMatch(
      /isUserNote\(item\)[\s\S]*?label: '編輯便條'[\s\S]*?label: item\.type === 'photo' \? '從頁面移除' : '刪除便條'[\s\S]*?intent: 'danger'/u,
    );
    expect(source).toContain("groups.push({ id: 'object', items: [pin] });");
    expect(html).toContain('ui-folder-artifact--translucent');
    expect(source).toContain("const NOTE_MATERIAL = 'translucent';");
    expect(source).toContain('autoPlace: props.freshKeys.includes(item.key),');
    expect(source).toContain('canvas.value?.togglePinById(id)');
    expect(source).toContain('@contextmenu="openMenu"');
  });

  it('gives each note a stable per-key paper texture', async () => {
    const html = await render({
      summary: { artist: 'Aimer', text: 'Artist summary' },
      objects: [
        {
          ...photo({ pinned: false }),
          key: 'note:0f8fad5b-d9cb-469f-a165-70867728950e',
          type: 'note',
          text: '備忘',
          order: 2,
        },
      ],
    });

    expect(html).toContain('data-paper-texture="1"');
    expect(html).toContain('data-paper-texture="2"');
    expect(source).toMatch(
      /function noteTexture\(key\)[\s\S]*?keyHash\(key\) % NOTE_TEXTURE_COUNT/u,
    );
  });

  it('routes every layout, pin, and stack change as one entry batch keyed by object', () => {
    expect(source).toMatch(
      /defineEmits\(\[\s*'layoutChange',\s*'activate',\s*'editNote',\s*'editPhotoText',\s*'readNote',\s*'remove',?\s*\]\)/u,
    );
    expect(source).toMatch(
      /function handleLayoutChange[\s\S]*?\{\s*immediate: false,\s*\}/u,
    );
    expect(source).toMatch(
      /function handlePinChange[\s\S]*?\{\s*immediate: true,\s*\}/u,
    );
    expect(source).toMatch(
      /function handleStackChange\(\{ ids \}\)[\s\S]*?order: index \+ 1[\s\S]*?\{ immediate: true \}/u,
    );
    expect(source).toMatch(
      /item\.source === 'derived'[\s\S]*?\{ type: item\.type, rotation: item\.rotation \}/u,
    );
    expect(source).not.toContain('summaryOrder');
    expect(source).not.toContain('objectLayoutChange');
  });
});
