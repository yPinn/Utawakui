import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { outputAppearanceFieldsForTemplate } from '../../../shared/outputAppearance.mjs';
import { getOutputWorkbenchData } from '../../constants/outputTemplates.js';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

async function renderRegisteredTemplate(templateId) {
  const data = getOutputWorkbenchData();
  const preset = data.templates.find((template) => template.id === templateId);
  const outputSlot = {
    ...data.slotDefaults[preset.kind],
    templateId,
  };

  return renderToString(
    createSSRApp({
      render: () =>
        h(ObsSlotWorkbench, {
          preset,
          activeKind: preset.kind,
          outputSlot,
        }),
    }),
  );
}

describe('ObsSlotWorkbench template appearance compatibility', () => {
  it.each([
    [
      'queue-board',
      ['fontFamily', 'fontScale', 'fontWeight', 'alignment', 'surface'],
      [],
    ],
    [
      'now-next',
      ['fontFamily', 'fontScale', 'fontWeight', 'alignment', 'surface'],
      [],
    ],
    [
      'art-card',
      ['fontFamily', 'fontScale', 'fontWeight'],
      ['alignment', 'surface'],
    ],
    [
      'cover-player',
      ['fontScale', 'fontWeight', 'surface'],
      ['fontFamily', 'alignment'],
    ],
  ])(
    'renders the effective %s appearance controls',
    async (templateId, shown, hidden) => {
      const html = await renderRegisteredTemplate(templateId);

      for (const key of shown) {
        expect(html, `${templateId} should render ${key}`).toContain(
          `output-appearance-${key}`,
        );
      }
      for (const key of hidden) {
        expect(html, `${templateId} should hide ${key}`).not.toContain(
          `output-appearance-${key}`,
        );
      }
    },
  );

  it('hides appearance reset when a template has no appearance controls', async () => {
    const html = await renderRegisteredTemplate('reading-aid');

    expect(html).not.toContain('恢復模板預設');
  });

  it('renders Live Stage presentation policy separately from appearance controls', async () => {
    const html = await renderRegisteredTemplate('live-stage');

    expect(html).toContain('歌詞呈現');
    expect(html).toContain('歌詞呈現策略');
    expect(html).toMatch(
      /<select id="output-appearance-lyricsPresentationPolicyId"[^>]*value="broadcast-compact"/,
    );
    expect(html).toContain('轉播精簡');
    expect(html).toContain('平衡分行');
    expect(html).toContain('忠實原文');
  });

  it('shows saved state instead of requiring a manual Appearance save', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'focus-line',
              name: '聚焦歌詞',
              kind: 'lyrics',
              appearanceFields: outputAppearanceFieldsForTemplate('focus-line'),
            },
            activeKind: 'lyrics',
            saveStatus: 'saved',
          }),
      }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('已儲存');
    expect(html).not.toMatch(/<button[^>]*>\s*儲存\s*<\/button>/u);
  });

  it('offers an explicit retry only after autosave fails', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'focus-line',
              name: '聚焦歌詞',
              kind: 'lyrics',
              appearanceFields: outputAppearanceFieldsForTemplate('focus-line'),
            },
            activeKind: 'lyrics',
            saveStatus: 'error',
          }),
      }),
    );

    expect(html).toContain('儲存失敗');
    expect(html).toContain('重試');
  });

  it('treats the existing Lyrics slot defaults as template defaults', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'focus-line',
              name: '聚焦歌詞',
              kind: 'lyrics',
              appearanceFields: outputAppearanceFieldsForTemplate('focus-line'),
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'focus-line',
              settings: {
                fontFamily: 'serif',
                fontScale: 'medium',
                fontWeight: 'bold',
                alignment: 'left',
                surface: 'transparent',
                captureSize: 'full',
              },
            },
          }),
      }),
    );

    expect(html).toMatch(/obs-slot-workbench__reset" disabled/);
  });

  it('hides controls that a fixed-identity template does not support', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'karaoke-stack',
              name: 'Classic KTV',
              kind: 'lyrics',
              editableAppearanceKeys: ['fontScale'],
              appearanceFields:
                outputAppearanceFieldsForTemplate('karaoke-stack'),
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'karaoke-stack',
              settings: {
                fontFamily: 'sans',
                fontScale: 'medium',
                fontWeight: 'bold',
                alignment: 'left',
                surface: 'transparent',
                captureSize: 'full',
              },
            },
          }),
      }),
    );

    expect(html).toContain('字級');
    expect(html).not.toContain('output-appearance-fontFamily');
    expect(html).not.toContain('output-appearance-fontWeight');
    expect(html).not.toContain('output-appearance-alignment');
    expect(html).not.toContain('output-appearance-surface');
  });

  it('shows the Manga-only furigana selector with the approved wording', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'manga-frame',
              name: 'Manga Frame',
              kind: 'lyrics',
              editableAppearanceKeys: [
                'fontFamily',
                'fontScale',
                'fontWeight',
                'furigana',
              ],
              appearanceFields:
                outputAppearanceFieldsForTemplate('manga-frame'),
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'manga-frame',
              settings: { furigana: 'auto', captureSize: 'full' },
            },
          }),
      }),
    );

    expect(html).toContain('假名標音');
    expect(html).toContain('有資料時顯示');
  });

  it('shows the kinetic material selector with material two selected by default', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'kinetic-pop',
              name: 'Kinetic Pop',
              kind: 'lyrics',
              editableAppearanceKeys: [
                'fontScale',
                'kineticMaterial',
                'kineticArrangement',
              ],
              appearanceFields:
                outputAppearanceFieldsForTemplate('kinetic-pop'),
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'kinetic-pop',
              settings: {
                fontScale: 'medium',
                kineticMaterial: 'candy-rim',
                kineticArrangement: 'straight',
                captureSize: 'full',
              },
            },
          }),
      }),
    );

    expect(html).toContain('文字樣式');
    expect(html).toContain('output-appearance-kineticMaterial');
    expect(html).toMatch(
      /<select id="output-appearance-kineticMaterial"[^>]*value="candy-rim"/,
    );
    expect(html).toContain('樣式 2｜漸層白框');
    expect(html).toContain('三款依句序切換');
    expect(html).toContain('文字排列');
    expect(html).toContain('output-appearance-kineticArrangement');
    expect(html).toMatch(
      /<select id="output-appearance-kineticArrangement"[^>]*value="straight"/,
    );
    expect(html).toContain('些微偏移');
  });

  it.each([undefined, 'unsupported-arrangement'])(
    'normalizes legacy or invalid kinetic arrangement %s to straight',
    async (kineticArrangement) => {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(ObsSlotWorkbench, {
              preset: {
                id: 'kinetic-pop',
                name: 'Kinetic Pop',
                kind: 'lyrics',
                editableAppearanceKeys: [
                  'fontScale',
                  'kineticMaterial',
                  'kineticArrangement',
                ],
                appearanceFields:
                  outputAppearanceFieldsForTemplate('kinetic-pop'),
              },
              activeKind: 'lyrics',
              outputSlot: {
                templateId: 'kinetic-pop',
                settings: {
                  fontScale: 'medium',
                  kineticMaterial: 'candy-rim',
                  ...(kineticArrangement ? { kineticArrangement } : {}),
                  captureSize: 'full',
                },
              },
            }),
        }),
      );

      expect(html).toMatch(
        /<select id="output-appearance-kineticArrangement"[^>]*value="straight"/,
      );
    },
  );

  it.each([undefined, 'unknown-material'])(
    'normalizes legacy or invalid kinetic material %s to material two',
    async (kineticMaterial) => {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(ObsSlotWorkbench, {
              preset: {
                id: 'kinetic-pop',
                name: 'Kinetic Pop',
                kind: 'lyrics',
                editableAppearanceKeys: ['fontScale', 'kineticMaterial'],
                appearanceFields:
                  outputAppearanceFieldsForTemplate('kinetic-pop'),
              },
              activeKind: 'lyrics',
              outputSlot: {
                templateId: 'kinetic-pop',
                settings: {
                  fontScale: 'medium',
                  ...(kineticMaterial ? { kineticMaterial } : {}),
                  captureSize: 'full',
                },
              },
            }),
        }),
      );

      expect(html).toMatch(
        /<select id="output-appearance-kineticMaterial"[^>]*value="candy-rim"/,
      );
    },
  );

  it('renders Ornate Vertical safe appearance controls from its schema', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'ornate-vertical',
              name: '華綴直書',
              kind: 'lyrics',
              appearanceFields:
                outputAppearanceFieldsForTemplate('ornate-vertical'),
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'ornate-vertical',
              settings: {
                fontFamily: 'serif',
                fontScale: 'medium',
                textColor: '#fff8ec',
                accentColor: '#ffffff',
                positionAnchor: 'center-right',
                positionOffsetX: 0,
                positionOffsetY: 0,
                captureSize: 'full',
              },
            },
          }),
      }),
    );

    expect(html).toContain('文字顏色');
    expect(html).toContain('藝術墨影');
    expect(html).toContain('顯示位置');
    expect(html).toContain('水平微調');
    expect(html).toContain('垂直微調');
    expect(html).toContain('type="color"');
    expect(html).toContain('type="range"');
    expect(html).toContain('恢復模板預設');
    expect(html).toMatch(
      /<select id="output-appearance-fontFamily"[^>]*value="ornate"/,
    );
    expect(html).toContain('華麗明朝（Hina Mincho）');
    expect(html).not.toContain('output-appearance-fontWeight');
  });
});
