import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SetlistFolderArtifactLayer from './SetlistFolderArtifactLayer.vue';

const source = readFileSync(
  new URL('./SetlistFolderArtifactLayer.vue', import.meta.url),
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
    createSSRApp({ render: () => h(SetlistFolderArtifactLayer, props) }),
  );
}

describe('SetlistFolderArtifactLayer', () => {
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
    expect(html).toContain('藝人曲庫摘要，已固定');
    expect(html).toContain('頁面照片，已固定，按 Enter 或空白鍵展開照片');
    expect(html.match(/--ui-folder-artifact-z:1/gu)).toHaveLength(1);
    expect(html.match(/--ui-folder-artifact-z:2/gu)).toHaveLength(1);
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

  it('edits user notes in place and offers per-type context menu actions', async () => {
    const note = {
      ...photo({ pinned: false }),
      key: 'note:22222222-2222-4222-8222-222222222222',
      type: 'note',
      text: '安可曲備忘',
    };
    const html = await render({
      objects: [note],
      editingKey: note.key,
    });

    expect(html).toContain('class="ui-textarea ui-textarea--bare"');
    expect(html).toMatch(
      /<label[^>]*for="folder-artifact-editor-[^"]+"[^>]*>[\s\S]*?便條內容/u,
    );
    expect(html).toContain('頁面便條，按 Enter 或空白鍵編輯便條');
    expect(source).toMatch(
      /function handleActivate[\s\S]*?item\?\.type === 'photo'[\s\S]*?isUserNote\(item\)\) editingKey\.value = id/u,
    );
    expect(source).toMatch(
      /item\.type === 'photo'[\s\S]*?label: '展開照片'[\s\S]*?label: '從頁面移除'[\s\S]*?danger: true/u,
    );
    expect(source).toMatch(
      /isUserNote\(item\)[\s\S]*?label: '編輯便條'[\s\S]*?label: '刪除便條'[\s\S]*?danger: true/u,
    );
    expect(source).toContain('return [pin];');
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
      /function noteTexture\(key\)[\s\S]*?hash % NOTE_TEXTURE_COUNT/u,
    );
  });

  it('routes every layout, pin, and stack change as one entry batch keyed by object', () => {
    expect(source).toContain(
      "defineEmits(['layoutChange', 'activate', 'noteCommit', 'remove'])",
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
