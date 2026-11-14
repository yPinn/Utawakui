import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { outputAppearanceFieldsForTemplate } from '../../../shared/outputAppearance.mjs';
import { localizeAppearanceField } from '../../utils/outputPanelCopy.js';
import { getOutputWorkbenchData } from '../../constants/outputTemplates.js';
import { outputInspectorTabs } from '../../utils/outputInspectorTabs.js';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

// Production fields reach the workbench localized (outputTemplates.js).
const fieldsFor = (templateId) =>
  outputAppearanceFieldsForTemplate(templateId).map(localizeAppearanceField);

const templateTabLabels = {
  'queue-board': ['版面', '文字', '色彩'],
  'karaoke-stack': ['文字', '色彩'],
  'kinetic-pop': ['版面', '文字', '色彩'],
  'ornate-vertical': ['定位', '文字', '色彩'],
  'chalkboard-vertical': ['定位', '文字', '色彩'],
  'centered-vertical': ['文字', '色彩'],
  'fisheye-lens': ['動態', '攝影機特效', '顯示', '版面', '文字', '色彩'],
  'live-stage': ['顯示', '文字', '色彩'],
  'manga-frame': ['顯示', '文字', '色彩'],
  'art-card': ['文字', '色彩'],
  'ticket-stub': ['文字'],
  'cover-player': ['文字', '色彩'],
  'receipt-setlist': ['動態', '版面', '文字'],
  'ribbon-setlist': ['動態', '色彩'],
};

async function renderRegisteredTemplate(
  templateId,
  presetOverrides = {},
  slotSettings = {},
) {
  const data = getOutputWorkbenchData();
  const preset = {
    ...data.templates.find((template) => template.id === templateId),
    ...presetOverrides,
  };
  const slotDefault = data.slotDefaults[preset.kind];
  const outputSlot = {
    ...slotDefault,
    templateId,
    settings: { ...slotDefault?.settings, ...slotSettings },
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
  it('groups the three Fisheye reflection choices under Decoration', async () => {
    const html = await renderRegisteredTemplate('fisheye-lens');
    expect(html).toContain('>裝飾</h3>');
    const reflection = html.match(
      /<select[^>]*id="output-appearance-fisheyeReflection"[^>]*>([\s\S]*?)<\/select>/u,
    )?.[1];
    expect(reflection).toMatch(
      /value="off"[^>]*>關閉<.*value="soft"[^>]*>柔和<.*value="standard"[^>]*>標準</su,
    );
  });

  it('lists the shared Fisheye transitions in matching order before entrance-only effects', async () => {
    const html = await renderRegisteredTemplate('fisheye-lens');
    const options = (key) => {
      const select = html.match(
        new RegExp(
          `<select[^>]*id="output-appearance-${key}"[^>]*>([\\s\\S]*?)</select>`,
          'u',
        ),
      )?.[1];
      return [
        ...(select ?? '').matchAll(
          /<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/gu,
        ),
      ].map(([, id, label]) => [id, label.trim()]);
    };
    expect(options('fisheyeEnter')).toEqual([
      ['arc', '沿弧翻入'],
      ['scale', '逐字彈入'],
      ['swirl', '漩渦展開'],
      ['cut', '直接切換'],
      ['smoke', '煙團露字'],
    ]);
    expect(options('fisheyeExit')).toEqual([
      ['auto', '隨段落切換'],
      ['arc', '沿弧轉出'],
      ['scale', '逐字縮退'],
      ['swirl', '漩渦捲退'],
      ['cut', '直接切換'],
    ]);
    expect(options('fisheyeGranularity').map(([id]) => id)).toEqual([
      'line',
      'phrase',
      'segment',
    ]);
  });

  it.each(getOutputWorkbenchData().templates)(
    'uses only the supported folder tabs and renders every field for $id',
    async ({ id, appearanceFields, presentationFields }) => {
      const html = await renderRegisteredTemplate(id);
      expect(
        [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)].map(
          ([, label]) => label,
        ),
      ).toEqual(templateTabLabels[id]);
      expect(html).toMatch(
        new RegExp(
          `aria-label="${templateTabLabels[id][0]}"[^>]+aria-selected="true"`,
          'u',
        ),
      );
      expect(html).not.toContain('data-output-side-toggle');
      for (const { key } of [...appearanceFields, ...presentationFields]) {
        expect(html).toContain(`output-appearance-${key}`);
      }
    },
  );

  it('keeps ornate vertical positioning split into its anchor and offsets', async () => {
    const html = await renderRegisteredTemplate('ornate-vertical');
    const labels = [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)].map(
      ([, label]) => label,
    );
    expect(labels).toEqual(['定位', '文字', '色彩']);
    expect(html).toMatch(/aria-label="定位"[^>]+aria-selected="true"/u);
    expect(html).toContain('定位基準');
    expect(html).toContain('位置微調');
    expect(html).toContain('文字陰影');
    expect(html).toContain('段落重點色');
    expect(html).not.toContain('data-output-side-toggle');
    for (const { key } of fieldsFor('ornate-vertical')) {
      expect(html).toContain(`output-appearance-${key}`);
    }
  });

  it('derives available categories from fields and keeps uncovered fields in the existing inspector', async () => {
    const fields = fieldsFor('ornate-vertical').filter(
      ({ group }) => group === 'typography' || group === 'custom-color',
    );
    expect(outputInspectorTabs(fields).map(({ id }) => id)).toEqual([
      'text',
      'color',
    ]);
    const html = await renderRegisteredTemplate('ornate-vertical', {
      appearanceFields: [
        ...fields,
        ...fieldsFor('centered-vertical')
          .filter(({ group }) => group === 'readability')
          .map((field) => ({ ...field, group: 'unclassified' })),
      ],
    });
    expect(html).toContain('data-output-side-toggle');
    expect(html).toContain('output-appearance-contrastStyle');
  });

  it('keeps a folder tab for a single supported element category', () => {
    const template = getOutputWorkbenchData().templates.find(
      ({ id }) => id === 'cover-player',
    );
    expect(
      template.elementTargets.map(({ id, fields }) => [
        id,
        outputInspectorTabs(fields).map(({ label }) => label),
      ]),
    ).toEqual([
      ['title', ['文字']],
      ['artist', ['顯示', '文字']],
      ['progress', ['顯示']],
      ['transport', ['顯示']],
    ]);
  });

  it('groups receipt layout, type, and both review settings in the shared inspector', async () => {
    const fields = fieldsFor('receipt-setlist');
    const tabs = outputInspectorTabs(fields);
    expect(
      tabs.map(({ label, groups }) => [
        label,
        groups.flatMap(({ fields }) => fields.map(({ key }) => key)),
      ]),
    ).toEqual([
      ['動態', ['receiptReview', 'receiptReviewInterval']],
      ['版面', ['receiptDirection']],
      ['文字', ['fontScale']],
    ]);

    const html = await renderRegisteredTemplate('receipt-setlist');
    expect(
      [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)].map(
        ([, label]) => label,
      ),
    ).toEqual(['動態', '版面', '文字']);
    expect(html).toContain('>字體設定</h3>');
    expect(html).toContain('>歷史回顧</h3>');
    expect(html).not.toContain('data-output-side-toggle');
    expect(html).not.toContain('output-appearance-paletteId');
    for (const { key } of fields) {
      expect(html).toContain(`output-appearance-${key}`);
    }
    expect(
      outputInspectorTabs(fields.filter(({ group }) => group !== 'motion')).map(
        ({ id }) => id,
      ),
    ).toEqual(['arrangement', 'text']);
  });

  it('uses the same motion controls for the Ribbon and Receipt Setlists', async () => {
    const reviewFields = (templateId) =>
      fieldsFor(templateId).filter(({ group }) => group === 'motion');
    expect(reviewFields('ribbon-setlist')).toEqual(
      reviewFields('receipt-setlist'),
    );
    const html = await renderRegisteredTemplate('ribbon-setlist');
    expect(html).toContain('>歷史回顧</h3>');
    expect(html).toContain('定時回顧歷史');
    expect(html).toContain('回顧間隔');
  });

  it('uses destination-neutral workbench and Browser Source sizing labels', async () => {
    const html = await renderRegisteredTemplate('queue-board');

    expect(html).toContain('aria-label="輸出工作台"');
    expect(html).toContain('480 × 810');
    expect(html).not.toContain('Browser Source 尺寸建議');
    expect(html).not.toContain('OBS 輸出工作台');
    expect(html).not.toContain('OBS 擷取建議');
  });

  it.each([
    [
      'queue-board',
      [
        'paletteId',
        'lookAmount',
        'fontFamily',
        'fontScale',
        'fontWeight',
        'surface',
        'spacingDensity',
      ],
      ['alignment'],
    ],
    [
      'art-card',
      [
        'paletteId',
        'lookAmount',
        'fontFamily',
        'fontScale',
        'fontWeight',
        'vinylSurfaceLight',
      ],
      ['alignment', 'surface'],
    ],
    [
      'ticket-stub',
      ['fontScale', 'fontWeight'],
      ['surface', 'paletteId', 'lookAmount', 'vinylSurfaceLight'],
    ],
    [
      'cover-player',
      ['paletteId', 'lookAmount', 'fontScale', 'fontWeight', 'surface'],
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
    const html = await renderRegisteredTemplate('focus-line', {
      appearanceFields: [],
      presentationFields: [],
    });

    expect(html).not.toContain('obs-slot-workbench__reset');
  });

  it('marks no field and offers no group reset at template defaults', async () => {
    const html = await renderRegisteredTemplate('queue-board');

    expect(html).not.toContain('data-modified');
    expect(html).not.toMatch(/恢復「[^」]+」預設/u);
  });

  it('marks a modified field and offers a reset for its group only', async () => {
    const html = await renderRegisteredTemplate(
      'queue-board',
      {},
      { fontWeight: 'bold' },
    );

    expect(html.match(/data-modified/gu)).toHaveLength(1);
    expect(html).toContain('恢復「字體設定」預設');
    expect(html).not.toContain('恢復「整體配色」預設');
    expect(html).not.toContain('恢復「背景」預設');
  });

  it('offers element targets only for a template that declares elements', async () => {
    const coverPlayer = await renderRegisteredTemplate('cover-player');
    const artCard = await renderRegisteredTemplate('art-card');

    expect(coverPlayer).toContain('調整對象');
    for (const label of ['整個模板', '曲名', '藝人', '進度', '播放控制']) {
      expect(coverPlayer).toContain(label);
    }
    expect(artCard).not.toContain('調整對象');
  });

  it('keeps the template view first and counts element changes in the template reset', async () => {
    const html = await renderRegisteredTemplate(
      'cover-player',
      {},
      { 'element.artist.visible': 'hidden' },
    );

    expect(html).not.toContain('data-modified');
    expect(html).toMatch(
      /<button[^>]*class="[^"]*obs-slot-workbench__reset[^"]*"(?![^>]*disabled)/u,
    );
  });

  it('renders Live Stage presentation policy separately from appearance controls', async () => {
    const html = await renderRegisteredTemplate('live-stage');

    expect(html).toContain('歌詞呈現');
    expect(html).toContain('歌詞呈現策略');
    expect(html).toContain('模板進階顯示');
    expect(html).toContain('不會改動歌詞本身');
    expect(html).toMatch(
      /<select id="output-appearance-lyricsPresentationPolicyId"[^>]*value="balanced"/,
    );
    expect(html).toContain('轉播精簡');
    expect(html).toContain('平衡分行');
    expect(html).toContain('忠實原文');
  });

  it('sorts configuration groups and fields by product order, not input order', async () => {
    const appearanceFields = [...fieldsFor('focus-line')].reverse();
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'focus-line',
              name: '聚焦歌詞',
              kind: 'lyrics',
              appearanceFields,
              presentationFields: [
                {
                  key: 'lyricsPresentationPolicyId',
                  label: '歌詞呈現策略',
                  control: 'select',
                  group: 'content',
                  groupLabel: '內容顯示',
                  groupOrder: 80,
                  order: 10,
                  defaultValue: 'balanced-lines',
                  options: [{ id: 'balanced-lines', label: '平衡分行' }],
                },
              ],
            },
            activeKind: 'lyrics',
          }),
      }),
    );
    const labels = [
      '內容顯示',
      '版面',
      '字體設定',
      '可讀性',
      '整體配色',
      '背景',
    ];

    for (let index = 1; index < labels.length; index += 1) {
      expect(html.indexOf(`>${labels[index - 1]}</h3>`)).toBeLessThan(
        html.indexOf(`>${labels[index]}</h3>`),
      );
    }
    expect(html.indexOf('對齊')).toBeLessThan(html.indexOf('間距'));
    expect(html.indexOf('間距')).toBeLessThan(html.indexOf('內容寬度'));
  });

  it('keeps an initial saved state out of persistent chrome', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'focus-line',
              name: '聚焦歌詞',
              kind: 'lyrics',
              appearanceFields: fieldsFor('focus-line'),
            },
            activeKind: 'lyrics',
            saveStatus: 'saved',
          }),
      }),
    );

    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-live="polite"');
    expect(html).not.toContain('已儲存');
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
              appearanceFields: fieldsFor('focus-line'),
            },
            activeKind: 'lyrics',
            saveStatus: 'error',
          }),
      }),
    );

    expect(html).toContain('無法儲存');
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
              appearanceFields: fieldsFor('focus-line'),
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

    expect(html).toMatch(
      /<button(?=[^>]*class="[^"]*obs-slot-workbench__reset)(?=[^>]*\sdisabled(?:\s|>))[^>]*>/u,
    );
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
              appearanceFields: fieldsFor('karaoke-stack'),
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
              appearanceFields: fieldsFor('manga-frame'),
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
              appearanceFields: fieldsFor('kinetic-pop'),
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

    expect(html).toContain('可讀性');
    expect(html).toContain('文字材質');
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
                appearanceFields: fieldsFor('kinetic-pop'),
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
                appearanceFields: fieldsFor('kinetic-pop'),
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
              name: '和風直書',
              kind: 'lyrics',
              appearanceFields: fieldsFor('ornate-vertical'),
            },
            activeKind: 'lyrics',
            recentColors: ['#112233', '#aabbcc'],
            savedColors: ['#445566', '#778899'],
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

    expect(html).toContain('自訂色彩');
    expect(html).toContain('文字色');
    expect(html).toContain('藝術墨影');
    expect(html).toContain('顯示位置');
    expect(html).toContain('水平微調');
    expect(html).toContain('垂直微調');
    expect(html).toContain('type="color"');
    expect(html).toContain('type="range"');
    expect(html.match(/aria-label="最近使用色票"/gu)).toHaveLength(1);
    expect(html.match(/aria-label="Output 常用色票"/gu)).toHaveLength(1);
    expect(html).toContain('套用至：文字色');
    expect(html.indexOf('obs-output-color-palette')).toBeGreaterThan(
      html.indexOf('id="output-appearance-accentColor"'),
    );
    expect(html).toContain('data-color-source="saved"');
    expect(html).toContain('aria-label="顯示位置"');
    expect(html).not.toContain('<select id="output-appearance-positionAnchor"');
    expect(html).toMatch(
      /obs-slot-workbench__inspector-header[^]*?<h2[^]*?<\/h2>[^]*?<button(?=[^>]*ui-icon-btn)(?=[^>]*obs-slot-workbench__reset)[^>]*>[^]*?重設模板[^]*?<\/button>[^]*?obs-property-section/u,
    );
    expect(html).toMatch(
      /<select id="output-appearance-fontFamily"[^>]*value="ornate"/,
    );
    expect(html).toContain('華麗明朝（Hina Mincho）');
    expect(html).not.toContain('output-appearance-fontWeight');
  });
});
