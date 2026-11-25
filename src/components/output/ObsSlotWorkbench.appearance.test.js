import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  isOutputAppearanceFieldVisible,
  outputAppearanceFieldsForTemplate,
} from '../../../shared/outputAppearance.mjs';
import { localizeAppearanceField } from '../../utils/outputPanelCopy.js';
import { getOutputWorkbenchData } from '../../constants/outputTemplates.js';
import {
  outputInspectorTab,
  outputInspectorTabs,
  sortOutputInspectorTabs,
} from '../../utils/outputInspectorTabs.js';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: { track: null } }),
}));

// Production fields reach the workbench localized (outputTemplates.js).
const fieldsFor = (templateId) =>
  outputAppearanceFieldsForTemplate(templateId).map(localizeAppearanceField);

const templateTabLabels = {
  'phantom-thieves': ['版面', '人物', '文字', '外觀'],
  'queue-board': ['版面', '文字', '外觀', '修飾'],
  'karaoke-stack': ['文字', '外觀'],
  'kinetic-pop': ['文字', '外觀'],
  'ornate-vertical': ['版面', '動態', '修飾', '文字', '外觀'],
  'chalkboard-vertical': ['版面', '修飾', '文字', '外觀'],
  'centered-vertical': ['外觀', '文字'],
  'fisheye-lens': ['動態', '版面', '修飾', '文字', '外觀'],
  'live-stage': ['文字', '外觀'],
  'manga-frame': ['文字', '版面', '外觀'],
  'art-card': ['外觀', '文字'],
  'ticket-stub': ['文字', '外觀'],
  'cover-player': ['外觀', '文字'],
  'receipt-setlist': ['動態', '文字', '外觀', '修飾'],
  'ribbon-setlist': ['動態', '外觀', '修飾'],
  'textured-credits': ['文字', '外觀'],
};
const workbenchTabOrder = [
  '顯示',
  '文字',
  '氣泡',
  '特效',
  '人物',
  '翻譯',
  '外觀',
  '修飾',
  '動態',
  '版面',
  '佔位',
];

async function renderRegisteredTemplate(
  templateId,
  presetOverrides = {},
  slotSettings = {},
  workbenchProps = {},
  renderContext,
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
          ...workbenchProps,
        }),
    }),
    renderContext,
  );
}

describe('ObsSlotWorkbench template appearance compatibility', () => {
  it('keeps registered Traditional Chinese settings labels within four characters', () => {
    const labels = getOutputWorkbenchData().templates.flatMap(({ id }) =>
      fieldsFor(id).map(({ label }) => label),
    );
    expect([
      ...new Set(labels.filter((label) => [...label].length > 4)),
    ]).toEqual([]);
  });

  it('groups the shared translation preference and saved size in their own panel', async () => {
    const html = await renderRegisteredTemplate(
      'manga-frame',
      {},
      {
        translationFontScale: 125,
      },
    );
    expect(html).toMatch(/role="tab" aria-label="翻譯"/u);
    expect(html).toContain('顯示譯文');
    expect(html).toContain('value="off"');
    expect(html).toContain('譯文字級');
    expect(html).toContain('125%');
    const translationControls = html.match(
      /<section[^>]*id="[^"]+-translation-panel"[^>]*>([\s\S]*?)<\/section>/u,
    )?.[1];
    expect(translationControls).not.toContain('<h3');
    expect(
      translationControls?.match(/class="obs-appearance-control-row(?:"| )/gu),
    ).toHaveLength(2);
    expect(translationControls).not.toContain(
      'obs-appearance-control-row--stacked',
    );
    expect(await renderRegisteredTemplate('art-card')).not.toContain(
      'output-translation-preference',
    );
  });

  it.each(getOutputWorkbenchData().templates.map(({ id }) => id))(
    'separates the fixed color look and material controls in %s',
    async (templateId) => {
      const { groups } = outputInspectorTabs(fieldsFor(templateId)).find(
        ({ id }) => id === 'color',
      );
      const keysFor = (id) =>
        groups.find((group) => group.id === id).fields.map(({ key }) => key);
      expect(keysFor('color-treatment')).toEqual(['paletteId', 'lookAmount']);
      expect(keysFor('material')).toEqual(['filmGrainAmount', 'filmGrainSize']);

      const html = await renderRegisteredTemplate(
        templateId,
        {},
        { paletteId: 'monochrome' },
      );
      expect(html).toContain('套用強度');
      expect(html).toContain('>材質</h3>');
      expect(html).toContain('output-appearance-filmGrainAmount');
      expect(html).toContain('output-appearance-filmGrainSize');
    },
  );

  it('groups independent Fisheye rim and reflection choices under Decoration', async () => {
    const decoration = outputInspectorTabs(fieldsFor('fisheye-lens'))
      .find(({ id }) => id === 'decoration')
      .groups.find(({ id }) => id === 'decoration');
    expect(decoration.fields.map(({ key }) => key)).toEqual([
      'fisheyeRim',
      'fisheyeReflection',
    ]);
    const html = await renderRegisteredTemplate('fisheye-lens');
    expect(html).toContain('>裝飾</h3>');
    for (const key of ['fisheyeRim', 'fisheyeReflection']) {
      const options = html.match(
        new RegExp(
          `<select[^>]*id="output-appearance-${key}"[^>]*>([\\s\\S]*?)</select>`,
          'u',
        ),
      )?.[1];
      expect(options).toMatch(
        /value="off"[^>]*>關閉<.*value="soft"[^>]*>柔和<.*value="standard"[^>]*>標準</su,
      );
    }
  });

  it('orders font presets before refinements and follows the motion timeline', () => {
    const groupKeys = (templateId, tabId) =>
      outputInspectorTabs([...fieldsFor(templateId)].reverse())
        .find(({ id }) => id === tabId)
        .groups.flatMap(({ fields }) => fields.map(({ key }) => key));
    expect(groupKeys('ornate-vertical', 'text').slice(0, 4)).toEqual([
      'fontFamily',
      'fontScale',
      'fontScaleAdjustment',
      'ornateArrangement',
    ]);
    expect(groupKeys('fisheye-lens', 'motion')).toEqual([
      'fisheyeEnter',
      'fisheyePulse',
      'fisheyeExit',
      'fisheyeBlur',
    ]);
  });

  it('mounts the font preview action in the typography heading', async () => {
    const context = {};
    const html = await renderRegisteredTemplate(
      'ornate-vertical',
      {},
      {},
      {},
      context,
    );
    const headingId = html.match(
      /<h3[^>]*>字體設定<\/h3>.*?id="(obs-property-actions-[^"]+)"/su,
    )?.[1];
    expect(headingId).toBeDefined();
    expect(context.teleports[`#${headingId}`]).toContain('字型預覽');
  });

  it('marks shared properties and live tools with the existing folder tones', async () => {
    const html = await renderRegisteredTemplate('fisheye-lens');
    expect(html).toMatch(
      /data-folder-tone="secondary" role="tab" aria-label="外觀"/u,
    );
    expect(html).toMatch(
      /data-folder-tone="secondary" role="tab" aria-label="翻譯"/u,
    );
    expect(html).toMatch(
      /data-folder-tone="tertiary" role="tab" aria-label="特效"/u,
    );
    expect(html).toMatch(/data-folder-shade="soft"[^>]*aria-label="佔位"/u);
    expect(html).toMatch(/data-folder-shade="soft"[^>]*aria-label="外觀"/u);
    expect(html).toMatch(/data-folder-shade="medium"[^>]*aria-label="翻譯"/u);
    expect(html).toMatch(/data-folder-shade="soft"[^>]*aria-label="版面"/u);
    expect(html).toMatch(/data-folder-shade="medium"[^>]*aria-label="特效"/u);
    for (const [label, icon] of [
      ['文字', 'type'],
      ['外觀', 'palette'],
      ['翻譯', 'languages'],
      ['特效', 'video'],
      ['版面', 'layout-template'],
      ['修飾', 'sparkles'],
      ['動態', 'activity'],
      ['佔位', 'locate-fixed'],
    ]) {
      const tab = html.match(
        new RegExp(
          `role="tab" aria-label="${label}"[^>]*>[\\s\\S]*?</button>`,
          'u',
        ),
      )?.[0];
      expect(tab).toContain(`lucide-${icon}`);
    }
    const tabs = outputInspectorTabs(fieldsFor('fisheye-lens'));
    expect(
      tabs.find(({ id }) => id === 'decoration').folderTone,
    ).toBeUndefined();
    expect(tabs.find(({ id }) => id === 'text').folderTone).toBeUndefined();
  });

  it('places output review before live tools, styling, and placement', () => {
    const tabs = [
      'performer-guide',
      'text',
      'layout',
      'portrait',
      'motion',
      'translation',
      'decoration',
      'display',
      'camera-effects',
      'color',
      'manga-bubbles',
    ].map((id) => outputInspectorTab(id));
    expect(sortOutputInspectorTabs(tabs).map(({ label }) => label)).toEqual(
      workbenchTabOrder,
    );
  });

  it('keeps the neutral template filmstrip at the end of the rail', async () => {
    const html = await renderRegisteredTemplate(
      'manga-frame',
      {},
      {},
      {
        quickSwitchPresets: getOutputWorkbenchData().templates.filter(
          ({ kind }) => kind === 'lyrics',
        ),
      },
    );
    expect(html).toMatch(
      /data-folder-tone="neutral" role="tab" aria-label="模板"/u,
    );
    expect(html).toMatch(/data-folder-shade="neutral"[^>]*aria-label="模板"/u);
    expect(
      [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)]
        .slice(-2)
        .map(([, label]) => label),
    ).toEqual(['佔位', '模板']);
    expect(html).toMatch(
      /data-folder-tone="tertiary" role="tab" aria-label="氣泡"/u,
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
    'uses only the supported folder tabs and renders fields available by default for $id',
    async ({ id, kind, appearanceFields, presentationFields }) => {
      const html = await renderRegisteredTemplate(id);
      const availableLabels = [
        ...templateTabLabels[id],
        ...(kind === 'lyrics' ? ['佔位', '翻譯'] : []),
        ...(id === 'fisheye-lens' ? ['特效'] : []),
        ...(id === 'manga-frame' ? ['氣泡'] : []),
      ];
      expect(
        [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)].map(
          ([, label]) => label,
        ),
      ).toEqual(
        workbenchTabOrder.filter((label) => availableLabels.includes(label)),
      );
      expect(html).toMatch(
        new RegExp(
          `aria-label="${templateTabLabels[id][0]}"[^>]+aria-selected="true"`,
          'u',
        ),
      );
      expect(html).not.toContain('data-output-side-toggle');
      for (const { id: tabId, groups } of outputInspectorTabs([
        ...appearanceFields,
        ...presentationFields,
      ])) {
        if (id === 'queue-board' && tabId === 'layout') {
          expect(
            groups.flatMap(({ fields }) => fields.map(({ key }) => key)),
          ).toEqual(['spacingDensity']);
          continue;
        }
        expect(groups.flatMap(({ fields }) => fields).length).toBeGreaterThan(
          1,
        );
      }
      const appearanceDefaults = {
        ...getOutputWorkbenchData().slotDefaults[kind]?.settings,
        ...Object.fromEntries(
          appearanceFields.map(({ key, defaultValue }) => [key, defaultValue]),
        ),
      };
      for (const field of [...appearanceFields, ...presentationFields]) {
        if (
          field.group === 'portrait' ||
          !isOutputAppearanceFieldVisible(field, appearanceDefaults)
        )
          continue;
        expect(html).toContain(`output-appearance-${field.key}`);
      }
    },
  );

  it('shows the chat shape control only when Chat is selected', async () => {
    const initial = await renderRegisteredTemplate('phantom-thieves');
    const chat = await renderRegisteredTemplate(
      'phantom-thieves',
      {},
      {
        phantomMode: 'chat',
        phantomChatShape: 'phone',
      },
    );
    expect(initial).not.toContain('output-appearance-phantomChatShape');
    expect(chat).toMatch(
      /id="output-appearance-phantomChatShape"[^>]*value="phone"/u,
    );
    expect(chat).not.toContain('output-appearance-phantomCardStyle');
    const side = await renderRegisteredTemplate(
      'phantom-thieves',
      {},
      {
        phantomMode: 'side-card',
        phantomCardStyle: 'portrait',
        phantomCorner: 'top-right',
        phantomPortraitSets: {
          activeId: '00000000-0000-4000-8000-000000000001',
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              phantomArtistName: 'Guest',
              phantomPortraitColor: '#4466aa',
              phantomPortraitPhoto: '00000000-0000-4000-8000-000000000011',
            },
          ],
        },
      },
    );
    expect(side).not.toContain('output-appearance-phantomChatShape');
    expect(side).toMatch(
      /id="output-appearance-phantomCardStyle"[^>]*value="portrait"/u,
    );
    expect(side).toMatch(
      /id="output-appearance-phantomCorner"[^>]*value="top-right"/u,
    );
    expect(side).not.toContain('output-appearance-phantomRansomFont');
    expect(side).toContain('aria-label="人物"');
    expect(side).not.toContain('id="output-appearance-phantomArtistName"');
    expect(side).not.toContain('id="output-appearance-phantomPortraitColor"');
    expect(side).not.toContain('id="output-appearance-phantomPortraitPhoto"');
    expect(side).not.toContain('id="output-portrait-set"');
    expect(side).toContain('aria-label="人物組合"');
    expect(side).toMatch(/aria-pressed="true"[^>]*aria-label="Guest"/u);
    expect(side).toContain('--ui-track-thumb-background:#4466aa');
    expect(side).toContain('>Guest</span>');
    expect(side).toMatch(/class="ui-visually-hidden"[^>]*>編輯人物組合/u);
    const ransom = await renderRegisteredTemplate(
      'phantom-thieves',
      {},
      {
        phantomMode: 'ransom',
        phantomRansomFont: 'kaibunsyo',
      },
    );
    expect(ransom).toMatch(
      /id="output-appearance-phantomRansomFont"[^>]*value="kaibunsyo"/u,
    );
  });

  it('selects Choice Stack within Phantom Thieves', async () => {
    const html = await renderRegisteredTemplate(
      'phantom-thieves',
      {},
      {
        phantomMode: 'choice-stack',
      },
    );
    expect(html).toMatch(
      /id="output-appearance-phantomMode"[^>]*value="choice-stack"/u,
    );
    expect(html).toContain('output-appearance-phantomCorner');
    expect(html).not.toContain('output-appearance-phantomCardStyle');
  });

  it('keeps ornate vertical positioning split into its anchor and offsets', async () => {
    const html = await renderRegisteredTemplate('ornate-vertical');
    const labels = [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)].map(
      ([, label]) => label,
    );
    expect(labels).toEqual([
      '文字',
      '翻譯',
      '外觀',
      '修飾',
      '動態',
      '版面',
      '佔位',
    ]);
    expect(html).toMatch(/aria-label="版面"[^>]+aria-selected="true"/u);
    expect(html).toContain('定位基準');
    expect(html).toContain('位置微調');
    expect(html).toContain('文字陰影');
    expect(html).toContain('段落強調');
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
      'decoration',
      'text',
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
      ['artist', ['文字']],
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
      ['動態', ['receiptReview', 'receiptReviewInterval', 'receiptDirection']],
      [
        '修飾',
        ['surface', 'setlistBackgroundColor', 'setlistBackgroundTransparency'],
      ],
      ['文字', ['fontFamily', 'fontScale', 'fontScaleAdjustment']],
      ['外觀', ['paletteId', 'lookAmount', 'filmGrainAmount', 'filmGrainSize']],
    ]);

    const html = await renderRegisteredTemplate(
      'receipt-setlist',
      {},
      {
        surface: 'custom',
      },
    );
    expect(
      [...html.matchAll(/role="tab" aria-label="([^"]+)"/gu)].map(
        ([, label]) => label,
      ),
    ).toEqual(['文字', '外觀', '修飾', '動態']);
    expect(html).toContain('>字體設定</h3>');
    expect(html).toContain('>歷史回顧</h3>');
    expect(html).not.toContain('data-output-side-toggle');
    for (const { key } of fields) {
      expect(html).toContain(`output-appearance-${key}`);
    }
    expect(
      outputInspectorTabs(fields.filter(({ group }) => group !== 'motion')).map(
        ({ id }) => id,
      ),
    ).toEqual(['layout', 'decoration', 'text', 'color']);
  });

  it('uses the same motion controls for the Ribbon and Receipt Setlists', async () => {
    const reviewFields = (templateId) =>
      fieldsFor(templateId).filter(({ group }) => group === 'motion');
    expect(reviewFields('ribbon-setlist')).toEqual(
      reviewFields('receipt-setlist'),
    );
    const html = await renderRegisteredTemplate('ribbon-setlist');
    expect(html).toContain('>歷史回顧</h3>');
    expect(html).toContain('定時回顧');
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

  it.each(['receipt-setlist', 'queue-board', 'ribbon-setlist'])(
    'keeps %s background in Styling and reveals solid color controls on selection',
    async (templateId) => {
      const transparent = await renderRegisteredTemplate(
        templateId,
        {},
        {
          surface: 'transparent',
        },
      );
      expect(transparent).toContain('aria-label="修飾"');
      expect(transparent).toContain('背景樣式');
      expect(transparent).toContain('純色');
      expect(transparent).not.toContain('output-appearance-setlistBackground');

      const solid = await renderRegisteredTemplate(
        templateId,
        {},
        {
          surface: 'custom',
          setlistBackgroundTransparency: 37,
        },
      );
      expect(solid).toContain('aria-label="修飾"');
      expect(solid).toContain('output-appearance-setlistBackgroundColor');
      expect(solid).toContain(
        'output-appearance-setlistBackgroundTransparency',
      );
      expect(solid).toContain('37%');
    },
  );

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
      ['paletteId', 'lookAmount', 'fontFamily', 'fontScale', 'fontWeight'],
      ['surface', 'vinylSurfaceLight'],
    ],
    [
      'cover-player',
      [
        'paletteId',
        'lookAmount',
        'fontFamily',
        'fontScale',
        'fontWeight',
        'surface',
      ],
      ['alignment'],
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

  it('indicates edits through the affected group reset', async () => {
    const html = await renderRegisteredTemplate(
      'queue-board',
      {},
      { fontWeight: 'bold' },
    );

    expect(html).not.toContain('data-modified');
    expect(html).toContain('恢復「字體設定」預設');
    expect(html).not.toContain('恢復「整體配色」預設');
    expect(html).not.toContain('恢復「背景」預設');
  });

  it('offers element targets only for a template that declares elements', async () => {
    const coverPlayer = await renderRegisteredTemplate('cover-player');
    const artCard = await renderRegisteredTemplate('art-card');

    expect(coverPlayer).toMatch(
      /obs-inspector-target[^]*?obs-appearance-control-row__label[^>]*>\s*調整對象\s*</u,
    );
    expect(coverPlayer).toMatch(
      /<label[^>]+for="output-appearance-target"[^>]*>\s*調整對象\s*</u,
    );
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

  it('keeps the Live Stage presentation policy in its own section of the text tab', async () => {
    const html = await renderRegisteredTemplate('live-stage');

    expect(html).toContain('呈現策略');
    expect(html).toContain('字幕呈現');
    expect(html).toContain('不會改動歌詞本身');
    expect(html).toMatch(
      /<select id="output-appearance-lyricsPresentationPolicyId"[^>]*value="balanced"/,
    );
    expect(html).toContain('轉播精簡');
    expect(html).toContain('平衡分行');
    expect(html).toContain('忠實原文');
    expect(html).toMatch(
      /id="[^"]+-text-panel"[^>]*>[\s\S]*?id="output-appearance-lyricsPresentationPolicyId"/u,
    );
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
                  label: '呈現策略',
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
      '字體設定',
      '可讀性',
      '整體配色',
      '背景',
      '版面',
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
              editableAppearanceKeys: ['fontFamily', 'fontScale'],
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
    expect(html).toContain('output-appearance-fontFamily');
    expect(html).not.toContain('output-appearance-fontWeight');
    expect(html).not.toContain('output-appearance-alignment');
    expect(html).not.toContain('output-appearance-surface');
  });

  it('places the saved Cinema Frame style in the layout inspector', async () => {
    const id = 'cinema-frame';
    const appearanceFields = fieldsFor(id);
    const html = await renderRegisteredTemplate(
      id,
      {
        id,
        kind: 'lyrics',
        name: 'Cinema Frame',
        appearanceFields,
        editableAppearanceKeys: appearanceFields.map(({ key }) => key),
      },
      { screenMaskLayout: 'cinema-letterbox' },
    );

    expect(html).toContain('畫幅樣式');
    expect(html).toContain('output-appearance-screenMaskLayout');
    expect(html).toContain('寬銀幕');
    expect(
      outputInspectorTabs(appearanceFields)
        .find(({ id }) => id === 'layout')
        .groups.flatMap(({ fields }) => fields.map(({ key }) => key)),
    ).toContain('screenMaskLayout');
  });

  it('shows the Manga-only furigana checkbox with the approved wording', async () => {
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
    expect(html).toMatch(
      /<input(?=[^>]*id="output-appearance-furigana")(?=[^>]*type="checkbox")[^>]*\bchecked/gu,
    );
  });

  it('shows the Chalkboard guide checkbox and hides the color when unchecked', async () => {
    const checkbox =
      /<input(?=[^>]*id="output-appearance-chalkboardRule")(?=[^>]*type="checkbox")[^>]*>/u;
    const shown = await renderRegisteredTemplate('chalkboard-vertical');
    expect(shown).toContain('輔助線');
    expect(shown.match(checkbox)?.[0]).toMatch(/\bchecked\b/u);
    expect(shown).toContain('output-appearance-chalkboardRuleColor');

    const hidden = await renderRegisteredTemplate(
      'chalkboard-vertical',
      {},
      {
        chalkboardRule: 'hidden',
      },
    );
    const unchecked = hidden.match(checkbox)?.[0];
    expect(unchecked).toBeDefined();
    expect(unchecked).not.toMatch(/\bchecked\b/u);
    expect(hidden).not.toContain('output-appearance-chalkboardRuleColor');
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
                fontFamily: 'ornate',
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
    expect(html).toMatch(
      /<select[^>]*id="output-appearance-ornateColumnMode"[^>]*value="retain"/u,
    );
    expect(html).toMatch(
      /<select[^>]*id="output-appearance-ornateEntrance"[^>]*value="random-slide"/u,
    );
    expect(html).toContain('>欄位與文字</h3>');
    expect(html).not.toContain('>歷史回顧</h3>');
    expect(html).toContain('>多欄顯示 ');
    expect(html).toContain('>文字進場 ');
    expect(html).toContain('一次一欄');
    expect(html).toContain('重點漢字先入');
    expect(html).toMatch(
      /<option[^>]*value="random-slide"[^>]*>左右滑入<\/option>/u,
    );
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
      /obs-inspector-header[^]*?<h2[^>]*>版面<\/h2>[^]*?<button(?=[^>]*ui-icon-btn)(?=[^>]*obs-slot-workbench__reset)[^>]*>[^]*?重設模板[^]*?<\/button>[^]*?obs-property-section/u,
    );
    expect(html).toMatch(
      /<input[^>]*id="output-appearance-fontFamily"[^>]*value="華麗明朝（Hina Mincho）"/,
    );
    expect(html).toContain('華麗明朝（Hina Mincho）');
    expect(html).not.toContain('output-appearance-fontWeight');
  });

  it('describes each selected Ornate Vertical mode beside its dropdown', async () => {
    const html = await renderRegisteredTemplate(
      'ornate-vertical',
      {},
      { ornateColumnMode: 'replace', ornateEntrance: 'sequential' },
    );
    expect(html).toMatch(
      /<select[^>]*id="output-appearance-ornateColumnMode"[^>]*value="replace"[^>]*aria-describedby="output-appearance-ornateColumnMode-hint"/u,
    );
    expect(html).toMatch(
      /<select[^>]*id="output-appearance-ornateEntrance"[^>]*value="sequential"[^>]*aria-describedby="output-appearance-ornateEntrance-hint"/u,
    );
    expect(html).toContain('新欄出現時，前一欄會消失。');
    expect(html).toContain('文字從欄頂往下依序出現。');
    expect(html).not.toContain('新欄出現在左側，前欄繼續顯示。');
  });
});
