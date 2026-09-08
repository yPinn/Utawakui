import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

const appearanceOptions = {
  fontFamily: [{ id: 'sans', label: '無襯線' }],
  fontScale: [{ id: 'medium', label: '標準' }],
  fontWeight: [{ id: 'bold', label: '粗體' }],
  alignment: [{ id: 'left', label: '靠左' }],
  surface: [{ id: 'transparent', label: '透明' }],
  furigana: [
    { id: 'auto', label: '有資料時顯示' },
    { id: 'off', label: '關閉' },
  ],
  kineticMaterial: [
    { id: 'solid-outline', label: '樣式 1｜單色黑框' },
    { id: 'candy-rim', label: '樣式 2｜漸層白框' },
    { id: 'chromatic-depth', label: '樣式 3｜右下錯位' },
    { id: 'cycle', label: '三款依句序切換' },
  ],
  kineticArrangement: [
    { id: 'straight', label: '端正' },
    { id: 'subtle-offset', label: '些微偏移' },
  ],
};

describe('ObsSlotWorkbench template appearance compatibility', () => {
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
            appearanceOptions,
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
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'manga-frame',
              settings: { furigana: 'auto', captureSize: 'full' },
            },
            appearanceOptions,
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
            appearanceOptions,
          }),
      }),
    );

    expect(html).toContain('文字樣式');
    expect(html).toContain('output-appearance-kineticMaterial');
    expect(html).toMatch(
      /<option value="candy-rim"[^>]*selected>樣式 2｜漸層白框<\/option>/,
    );
    expect(html).toContain('三款依句序切換');
    expect(html).toContain('文字排列');
    expect(html).toContain('output-appearance-kineticArrangement');
    expect(html).toMatch(
      /<option value="straight"[^>]*selected>端正<\/option>/,
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
              appearanceOptions,
            }),
        }),
      );

      expect(html).toMatch(
        /<option value="straight"[^>]*selected>端正<\/option>/,
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
              appearanceOptions,
            }),
        }),
      );

      expect(html).toMatch(
        /<option value="candy-rim"[^>]*selected>樣式 2｜漸層白框<\/option>/,
      );
    },
  );
});
