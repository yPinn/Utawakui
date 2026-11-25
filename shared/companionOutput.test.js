import { describe, expect, it } from 'vitest';
import templates from './outputTemplateValues.json';
import {
  COMPANION_OUTPUT_PORTRAIT,
  COMPANION_OUTPUT_RESET,
  companionOutputSettingsPatch,
  parseCompanionOutputChange,
  parseCompanionOutputSnapshot,
  projectCompanionOutputSlot,
} from './companionOutput.mjs';

describe('companion Output inspector contract', () => {
  it.each(Object.entries(templates.templateKinds))(
    'round-trips the inspector settings for %s',
    (templateId, kind) => {
      const slots = templates.slots.map(({ id, defaultTemplateId }) =>
        projectCompanionOutputSlot({
          templateId: id === kind ? templateId : defaultTemplateId,
        }),
      );
      expect(parseCompanionOutputSnapshot(slots)).toEqual(slots);
    },
  );

  it.each([
    ['fisheye-lens', 'textColor', '#84bca2'],
    ['fisheye-lens', 'filmGrainAmount', 50],
    ['live-stage', 'lyricsPresentationPolicyId', 'balanced'],
    ['cover-player', 'element.title.fontWeight', 'bold'],
    ['receipt-setlist', 'surface', 'custom'],
    ['ribbon-setlist', 'setlistBackgroundColor', '#84bca2'],
    ['queue-board', 'setlistBackgroundTransparency', 37],
  ])('admits supported settings for %s', (templateId, fieldKey, value) => {
    const intent = { templateId, fieldKey, value };
    expect(parseCompanionOutputChange(intent)).toEqual(intent);
  });

  it('rejects out-of-range values and cross-template element fields', () => {
    expect(
      parseCompanionOutputChange({
        templateId: 'fisheye-lens',
        fieldKey: 'filmGrainAmount',
        value: 101,
      }),
    ).toBeNull();
    expect(
      parseCompanionOutputChange({
        templateId: 'art-card',
        fieldKey: 'element.title.fontWeight',
        value: 'bold',
      }),
    ).toBeNull();
  });

  it('activates solid color settings only with the custom Setlist background', () => {
    const templateId = 'queue-board';
    const intent = {
      templateId,
      fieldKey: 'setlistBackgroundTransparency',
      value: 37,
    };
    expect(
      companionOutputSettingsPatch(
        projectCompanionOutputSlot({ templateId }),
        intent,
      ),
    ).toBeNull();
    const current = projectCompanionOutputSlot({
      templateId,
      settings: { surface: 'custom' },
    });
    expect(companionOutputSettingsPatch(current, intent)).toEqual({
      setlistBackgroundTransparency: 37,
    });
  });

  it('sets only an existing portrait and resets appearance without deleting assets', () => {
    const templateId = 'phantom-thieves';
    const id = '17b47211-96ab-4561-838b-b4cdd1a84808';
    const settings = {
      phantomCorner: 'top-right',
      phantomPortraitSets: {
        activeId: '',
        items: [{ id, phantomArtistName: 'Singer', phantomPortraitPhoto: id }],
      },
    };
    const slot = projectCompanionOutputSlot({ templateId, settings });
    expect(slot.portraits.items).toEqual([
      {
        id,
        phantomArtistName: 'Singer',
        phantomPortraitPhoto: id,
        phantomPortraitColor: '',
      },
    ]);
    expect(
      companionOutputSettingsPatch(
        slot,
        {
          templateId,
          fieldKey: COMPANION_OUTPUT_PORTRAIT,
          value: id,
        },
        settings,
      ),
    ).toEqual({
      phantomPortraitSets: {
        ...settings.phantomPortraitSets,
        activeId: id,
        items: [
          {
            ...settings.phantomPortraitSets.items[0],
            phantomPortraitColor: '',
          },
        ],
      },
    });
    expect(
      companionOutputSettingsPatch(
        slot,
        {
          templateId,
          fieldKey: COMPANION_OUTPUT_RESET,
          value: null,
        },
        settings,
      ),
    ).toEqual({ phantomCorner: 'auto' });
  });
});
