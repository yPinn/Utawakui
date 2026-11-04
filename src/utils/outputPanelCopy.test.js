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
      '色彩處理',
      '自訂色彩',
      '文字',
      '可讀性',
      '背景',
      '版面',
      '動態',
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
      groupLabel: '色彩處理',
      options: [
        { id: 'original', label: '模板原色' },
        { id: 'warm', label: '暖色舞台' },
        { id: 'cool', label: '冷色舞台' },
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
