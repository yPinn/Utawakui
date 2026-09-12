import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_APPEARANCE_FIELDS,
  outputAppearanceFieldsForTemplate,
} from '../../shared/outputAppearance.mjs';
import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import { normalizeLyricsPresentationPolicyId } from '../../shared/presentation/lyricsPresentationPolicies.mjs';
import { applyOverlayAppearance } from '../../overlay/shared/appearance.mjs';
import { parseOutputMessage } from '../../overlay/shared/runtime.mjs';
import { buildOutputSlotPayload } from '../../src/utils/outputSlotPayload.js';
import { createOutputServer } from './outputServer.js';
import { upsertOutputSlot } from './outputSlots.js';

const DATASET_TARGETS = Object.freeze({
  alignment: 'ovlAlign',
  contentWidth: 'ovlContentWidth',
  contrastStyle: 'ovlContrast',
  fontFamily: 'ovlFont',
  fontScale: 'ovlScale',
  fontWeight: 'ovlWeight',
  furigana: 'ovlFurigana',
  kineticArrangement: 'ovlKineticArrangement',
  kineticMaterial: 'ovlKineticMaterial',
  paletteId: 'ovlPalette',
  positionAnchor: 'ovlPosition',
  spacingDensity: 'ovlDensity',
  surface: 'ovlSurface',
});

const STYLE_TARGETS = Object.freeze({
  accentColor: ['--ovl-user-accent-color', ''],
  positionOffsetX: ['--ovl-user-position-x', '%'],
  positionOffsetY: ['--ovl-user-position-y', '%'],
  textColor: ['--ovl-user-text-color', ''],
});

function nonDefaultValue(field) {
  if (field.control === 'select') {
    return (
      field.options.find((option) => option.id !== field.defaultValue)?.id ??
      field.defaultValue
    );
  }
  if (field.control === 'color') return '#123456';
  if (field.control === 'range') return field.max;
  throw new Error(`No test value for ${field.key}`);
}

function appearanceSettingsFor(templateId) {
  const settings = Object.fromEntries(
    OUTPUT_APPEARANCE_FIELDS.map((field) => [
      field.key,
      nonDefaultValue(field),
    ]),
  );
  for (const field of outputAppearanceFieldsForTemplate(templateId)) {
    settings[field.key] = nonDefaultValue(field);
  }
  return settings;
}

function appearanceDocument() {
  const styleValues = new Map();
  return {
    document: {
      documentElement: {
        dataset: {},
        style: {
          setProperty: (key, value) => styleValues.set(key, value),
        },
      },
    },
    styleValues,
  };
}

describe('Output settings path', () => {
  const temporaryDirectories = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(Object.entries(OUTPUT_TEMPLATE_VALUES.templateKinds))(
    'carries bounded %s settings through persistence, config transport, and its template contract',
    (templateId, kind) => {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'utawakui-output-settings-path-'),
      );
      temporaryDirectories.push(directory);
      const settings = {
        ...appearanceSettingsFor(templateId),
        captureSize: 'large',
        lyricsPresentationPolicyId: 'literal',
      };
      const payload = buildOutputSlotPayload({
        templateId,
        styleSetIds: ['runtime-source'],
        settings,
      });
      const persisted = upsertOutputSlot(directory, kind, payload);
      const server = createOutputServer({ overlaySlots: persisted.slots });
      const message = parseOutputMessage(
        JSON.stringify({
          type: 'overlay.config.snapshot',
          overlayConfig: server.getOverlayConfig(),
        }),
      );
      const slot = message.overlayConfig.slots[kind];
      const { document, styleValues } = appearanceDocument();

      applyOverlayAppearance(document, slot);

      expect(slot.templateId).toBe(templateId);
      expect(slot.styleSetIds).toEqual(['runtime-source']);
      expect(slot.settings.captureSize).toBe(
        OUTPUT_TEMPLATE_VALUES.templateCaptureSizes[templateId].default,
      );
      expect(
        normalizeLyricsPresentationPolicyId(
          templateId,
          slot.settings.lyricsPresentationPolicyId,
        ),
      ).toBe(templateId === 'live-stage' ? 'literal' : null);
      expect(document.documentElement.dataset.ovlTemplate).toBe(templateId);

      const exposedFields = new Map(
        outputAppearanceFieldsForTemplate(templateId).map((field) => [
          field.key,
          field,
        ]),
      );
      for (const field of OUTPUT_APPEARANCE_FIELDS) {
        const exposedField = exposedFields.get(field.key);
        const expectedValue = exposedField
          ? nonDefaultValue(exposedField)
          : OUTPUT_APPEARANCE_DEFAULTS[field.key];
        const datasetTarget = DATASET_TARGETS[field.key];
        if (datasetTarget) {
          expect(
            document.documentElement.dataset[datasetTarget],
            `${templateId}.${field.key}`,
          ).toBe(String(expectedValue));
          continue;
        }
        const [styleTarget, unit] = STYLE_TARGETS[field.key];
        expect(styleValues.get(styleTarget), `${templateId}.${field.key}`).toBe(
          `${expectedValue}${unit}`,
        );
      }
    },
  );
});
