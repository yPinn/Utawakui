import { describe, expect, it } from 'vitest';
import {
  OUTPUT_APPEARANCE_FIELDS,
  OUTPUT_APPEARANCE_GROUPS,
  outputAppearanceFieldsForTemplate,
  outputElementTargetsForTemplate,
} from '../../shared/outputAppearance.mjs';
import { OUTPUT_TEMPLATE_ELEMENTS } from '../../shared/outputTemplateElements.mjs';
import { LYRICS_PRESENTATION_POLICIES } from '../../shared/presentation/lyricsPresentationPolicies.mjs';
import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import { i18n } from './i18n.js';
import {
  localizeAppearanceField,
  localizeElementTarget,
  lyricsPolicyLabel,
  outputSlotLabel,
} from './outputPanelCopy.js';

// Shared output definitions carry ids; these keys are built from them at runtime.
const isText = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.startsWith('outputPanel.');

describe('output panel copy', () => {
  it('names the inspector groups in common-to-specific order', () => {
    const labels = OUTPUT_APPEARANCE_GROUPS.map(
      (group) =>
        localizeAppearanceField({ key: 'paletteId', group: group.id })
          .groupLabel,
    );
    expect(labels).toEqual([
      '整體配色',
      '自訂色彩',
      '字體設定',
      '可讀性',
      '背景',
      '裝飾',
      '材質',
      '版面',
      '人物外觀',
      '歷史回顧',
      '內容顯示',
    ]);
  });

  it('words the semantic Look and font choices', () => {
    const [look] = outputAppearanceFieldsForTemplate('art-card').map(
      localizeAppearanceField,
    );
    expect(look).toMatchObject({
      key: 'paletteId',
      label: '配色風格',
      groupLabel: '整體配色',
      options: [
        { id: 'original', label: '模板原色' },
        { id: 'warm', label: '暖調舞台' },
        { id: 'cool', label: '冷調舞台' },
        { id: 'warm-film', label: 'Fujifilm NOSTALGIC Neg.' },
        { id: 'cool-film', label: 'Fujifilm ETERNA' },
        { id: 'velvia-style', label: 'Fujifilm Velvia' },
        { id: 'kodak-gold-200-style', label: 'Kodak Gold 200' },
        { id: 'polaroid-600-style', label: 'Polaroid 600' },
        { id: 'monochrome', label: '黑白' },
        { id: 'high-contrast', label: '高對比' },
      ],
    });
    const font = outputAppearanceFieldsForTemplate('ornate-vertical')
      .map(localizeAppearanceField)
      .find((field) => field.key === 'fontFamily');
    expect(font.options).toEqual([
      { id: 'ornate', label: '華麗明朝（Hina Mincho）' },
      { id: 'antique', label: '古典明朝（GenEi Antique）' },
      { id: 'sans', label: '無襯線' },
      { id: 'serif', label: '襯線' },
      { id: 'rounded', label: '圓體' },
    ]);
  });

  it('labels every field, option, unit and element target', () => {
    for (const field of OUTPUT_APPEARANCE_FIELDS.map(localizeAppearanceField)) {
      expect(isText(field.label), field.key).toBe(true);
      expect(isText(field.groupLabel), field.key).toBe(true);
      for (const option of field.options ?? [])
        expect(isText(option.label), `${field.key}/${option.id}`).toBe(true);
    }
    for (const templateId of Object.keys(OUTPUT_TEMPLATE_ELEMENTS))
      for (const target of outputElementTargetsForTemplate(templateId).map(
        localizeElementTarget,
      )) {
        expect(isText(target.label), target.id).toBe(true);
        for (const field of target.fields) {
          expect(isText(field.label), field.key).toBe(true);
          for (const option of field.options ?? [])
            expect(isText(option.label), `${field.key}/${option.id}`).toBe(
              true,
            );
        }
      }
    const interval = OUTPUT_APPEARANCE_FIELDS.map(localizeAppearanceField).find(
      (field) => field.key === 'receiptReviewInterval',
    );
    expect(interval.unit).toBe(' 秒');
    const name = OUTPUT_APPEARANCE_FIELDS.map(localizeAppearanceField).find(
      (field) => field.key === 'phantomArtistName',
    );
    expect(name.placeholder).toBe('跟隨歌手名稱');
  });

  it.each([
    ['zh-TW', '欄位與文字'],
    ['en-US', 'Columns and text'],
  ])('describes the Ornate Vertical motion options in %s', (locale, title) => {
    const previous = i18n.global.locale.value;
    try {
      i18n.global.locale.value = locale;
      const fields = outputAppearanceFieldsForTemplate('ornate-vertical')
        .filter(({ group }) => group === 'motion')
        .map(localizeAppearanceField);
      for (const field of fields) {
        expect(field.groupLabel).toBe(title);
        for (const { label, hint } of field.options) {
          expect(isText(label)).toBe(true);
          expect(isText(hint)).toBe(true);
        }
      }
    } finally {
      i18n.global.locale.value = previous;
    }
  });

  it('names every lyrics presentation policy and output slot', () => {
    expect(
      Object.keys(LYRICS_PRESENTATION_POLICIES).map(lyricsPolicyLabel),
    ).toEqual(['忠實原文', '平衡分行', '轉播精簡']);
    expect(
      OUTPUT_TEMPLATE_VALUES.slots.map(({ id }) => outputSlotLabel(id)),
    ).toEqual(['歌詞', '歌單', '播放中']);
  });
});
