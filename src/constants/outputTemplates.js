import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import {
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  outputAppearanceFieldsForTemplate,
  outputElementTargetsForTemplate,
} from '../../shared/outputAppearance.mjs';
import { lyricsPresentationProfileForTemplate } from '../../shared/presentation/lyricsPresentation.mjs';
import {
  lyricsPresentationPolicyOptionsForTemplate,
  normalizeLyricsPresentationPolicyId,
} from '../../shared/presentation/lyricsPresentationPolicies.mjs';
import { lyricsTemplateCapabilities } from '../../shared/presentation/lyricsTemplateCapabilities.mjs';
import { defaultCaptureSizeIdForKind } from './outputCaptureSizes.js';
import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';
import {
  localizeAppearanceField,
  localizeElementTarget,
  lyricsPolicyLabel,
  outputSlotLabel,
} from '../utils/outputPanelCopy.js';
import { UI_LOCALE } from '../utils/uiLocale.js';
import { t } from '../utils/i18n.js';

export const OUTPUT_TEMPLATE_KINDS = Object.freeze(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => ({
    id: slot.id,
    label: outputSlotLabel(slot.id),
  })),
);

const OUTPUT_KIND_ORDER = new Map(
  OUTPUT_TEMPLATE_KINDS.map((kind, index) => [kind.id, index]),
);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Immutable compatibility facade; each preview projects this same snapshot for its template.
export const OUTPUT_PREVIEW_SCENE = deepFreeze(createOutputPreviewScene());

const OUTPUT_TEMPLATE_DEFINITIONS = [
  {
    id: 'receipt-setlist',
    kind: 'setlist',
    order: 10,
    name: t('outputPanel.templates.receiptSetlist.name'),
    availability: {
      summary: t('outputPanel.templates.receiptSetlist.availability.summary'),
    },
    summary: t('outputPanel.templates.receiptSetlist.summary'),
    detail: t('outputPanel.templates.receiptSetlist.detail'),
    preview: {
      layoutLabel: t(
        'outputPanel.templates.receiptSetlist.preview.layoutLabel',
      ),
      motionLabel: t(
        'outputPanel.templates.receiptSetlist.preview.motionLabel',
      ),
    },
    tags: [
      t('outputPanel.templates.receiptSetlist.tags.0'),
      t('outputPanel.templates.receiptSetlist.tags.1'),
      t('outputPanel.templates.receiptSetlist.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.receiptSetlist.settings.0.label'),
        value: t('outputPanel.templates.receiptSetlist.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.receiptSetlist.settings.1.label'),
        value: t('outputPanel.templates.receiptSetlist.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.receiptSetlist.settings.2.label'),
        value: t('outputPanel.templates.receiptSetlist.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.receiptSetlist.settings.3.label'),
        value: t('outputPanel.templates.receiptSetlist.settings.3.value'),
      },
    ],
  },
  {
    id: 'queue-board',
    kind: 'setlist',
    order: 20,
    name: t('outputPanel.templates.queueBoard.name'),
    availability: {
      summary: t('outputPanel.templates.queueBoard.availability.summary'),
    },
    summary: t('outputPanel.templates.queueBoard.summary'),
    detail: t('outputPanel.templates.queueBoard.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.queueBoard.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.queueBoard.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.queueBoard.tags.0'),
      t('outputPanel.templates.queueBoard.tags.1'),
      t('outputPanel.templates.queueBoard.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.queueBoard.settings.0.label'),
        value: t('outputPanel.templates.queueBoard.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.queueBoard.settings.1.label'),
        value: t('outputPanel.templates.queueBoard.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.queueBoard.settings.2.label'),
        value: t('outputPanel.templates.queueBoard.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.queueBoard.settings.3.label'),
        value: t('outputPanel.templates.queueBoard.settings.3.value'),
      },
    ],
  },
  {
    id: 'karaoke-stack',
    kind: 'lyrics',
    order: 10,
    name: t('outputPanel.templates.karaokeStack.name'),
    availability: {
      summary: t('outputPanel.templates.karaokeStack.availability.summary'),
    },
    summary: t('outputPanel.templates.karaokeStack.summary'),
    detail: t('outputPanel.templates.karaokeStack.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.karaokeStack.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.karaokeStack.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.karaokeStack.tags.0'),
      t('outputPanel.templates.karaokeStack.tags.1'),
      t('outputPanel.templates.karaokeStack.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.karaokeStack.settings.0.label'),
        value: t('outputPanel.templates.karaokeStack.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.karaokeStack.settings.1.label'),
        value: t('outputPanel.templates.karaokeStack.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.karaokeStack.settings.2.label'),
        value: t('outputPanel.templates.karaokeStack.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.karaokeStack.settings.3.label'),
        value: t('outputPanel.templates.karaokeStack.settings.3.value'),
      },
      {
        label: t('outputPanel.templates.karaokeStack.settings.4.label'),
        value: t('outputPanel.templates.karaokeStack.settings.4.value'),
      },
      {
        label: t('outputPanel.templates.karaokeStack.settings.5.label'),
        value: t('outputPanel.templates.karaokeStack.settings.5.value'),
      },
    ],
  },
  {
    id: 'manga-frame',
    kind: 'lyrics',
    order: 30,
    name: t('outputPanel.templates.mangaFrame.name'),
    availability: {
      summary: t('outputPanel.templates.mangaFrame.availability.summary'),
    },
    summary: t('outputPanel.templates.mangaFrame.summary'),
    detail: t('outputPanel.templates.mangaFrame.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.mangaFrame.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.mangaFrame.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.mangaFrame.tags.0'),
      t('outputPanel.templates.mangaFrame.tags.1'),
      t('outputPanel.templates.mangaFrame.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.mangaFrame.settings.0.label'),
        value: t('outputPanel.templates.mangaFrame.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.mangaFrame.settings.1.label'),
        value: t('outputPanel.templates.mangaFrame.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.mangaFrame.settings.2.label'),
        value: t('outputPanel.templates.mangaFrame.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.mangaFrame.settings.3.label'),
        value: t('outputPanel.templates.mangaFrame.settings.3.value'),
      },
      {
        label: t('outputPanel.templates.mangaFrame.settings.4.label'),
        value: t('outputPanel.templates.mangaFrame.settings.4.value'),
      },
    ],
  },
  {
    id: 'kinetic-pop',
    kind: 'lyrics',
    order: 25,
    name: t('outputPanel.templates.kineticPop.name'),
    availability: {
      summary: t('outputPanel.templates.kineticPop.availability.summary'),
    },
    summary: t('outputPanel.templates.kineticPop.summary'),
    detail: t('outputPanel.templates.kineticPop.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.kineticPop.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.kineticPop.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.kineticPop.tags.0'),
      t('outputPanel.templates.kineticPop.tags.1'),
      t('outputPanel.templates.kineticPop.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.kineticPop.settings.0.label'),
        value: t('outputPanel.templates.kineticPop.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.kineticPop.settings.1.label'),
        value: t('outputPanel.templates.kineticPop.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.kineticPop.settings.2.label'),
        value: t('outputPanel.templates.kineticPop.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.kineticPop.settings.3.label'),
        value: t('outputPanel.templates.kineticPop.settings.3.value'),
      },
      {
        label: t('outputPanel.templates.kineticPop.settings.4.label'),
        value: t('outputPanel.templates.kineticPop.settings.4.value'),
      },
      {
        label: t('outputPanel.templates.kineticPop.settings.5.label'),
        value: t('outputPanel.templates.kineticPop.settings.5.value'),
      },
    ],
  },
  {
    id: 'ornate-vertical',
    kind: 'lyrics',
    order: 28,
    name: t('outputPanel.templates.ornateVertical.name'),
    availability: {
      summary: t('outputPanel.templates.ornateVertical.availability.summary'),
    },
    summary: t('outputPanel.templates.ornateVertical.summary'),
    detail: t('outputPanel.templates.ornateVertical.detail'),
    preview: {
      layoutLabel: t(
        'outputPanel.templates.ornateVertical.preview.layoutLabel',
      ),
      motionLabel: t(
        'outputPanel.templates.ornateVertical.preview.motionLabel',
      ),
    },
    tags: [
      t('outputPanel.templates.ornateVertical.tags.0'),
      t('outputPanel.templates.ornateVertical.tags.1'),
      t('outputPanel.templates.ornateVertical.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.ornateVertical.settings.0.label'),
        value: t('outputPanel.templates.ornateVertical.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.ornateVertical.settings.1.label'),
        value: t('outputPanel.templates.ornateVertical.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.ornateVertical.settings.2.label'),
        value: t('outputPanel.templates.ornateVertical.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.ornateVertical.settings.3.label'),
        value: t('outputPanel.templates.ornateVertical.settings.3.value'),
      },
      {
        label: t('outputPanel.templates.ornateVertical.settings.4.label'),
        value: t('outputPanel.templates.ornateVertical.settings.4.value'),
      },
      {
        label: t('outputPanel.templates.ornateVertical.settings.5.label'),
        value: t('outputPanel.templates.ornateVertical.settings.5.value'),
      },
      {
        label: t('outputPanel.templates.ornateVertical.settings.6.label'),
        value: t('outputPanel.templates.ornateVertical.settings.6.value'),
      },
    ],
  },
  {
    id: 'centered-vertical',
    kind: 'lyrics',
    order: 31,
    name: t('outputPanel.templates.centeredVertical.name'),
    availability: {
      summary: t('outputPanel.templates.centeredVertical.availability'),
    },
    summary: t('outputPanel.templates.centeredVertical.summary'),
    detail: t('outputPanel.templates.centeredVertical.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.centeredVertical.layoutLabel'),
      motionLabel: t('outputPanel.templates.centeredVertical.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.centeredVertical.columnTag'),
      t('outputPanel.templates.centeredVertical.anchorTag'),
      t('outputPanel.templates.centeredVertical.surfaceTag'),
    ],
    settings: [],
  },
  {
    id: 'chalkboard-vertical',
    kind: 'lyrics',
    order: 29,
    name: t('outputPanel.templates.chalkboardVertical.name'),
    availability: {
      summary: t('outputPanel.templates.chalkboardVertical.availability'),
    },
    summary: t('outputPanel.templates.chalkboardVertical.summary'),
    detail: t('outputPanel.templates.chalkboardVertical.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.chalkboardVertical.layoutLabel'),
      motionLabel: t('outputPanel.templates.chalkboardVertical.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.chalkboardVertical.chalkTag'),
      t('outputPanel.templates.chalkboardVertical.columnTag'),
      t('outputPanel.templates.chalkboardVertical.sideTag'),
    ],
    settings: [],
  },
  {
    id: 'live-stage',
    kind: 'lyrics',
    order: 20,
    name: t('outputPanel.templates.liveStage.name'),
    availability: {
      summary: t('outputPanel.templates.liveStage.availability.summary'),
    },
    summary: t('outputPanel.templates.liveStage.summary'),
    detail: t('outputPanel.templates.liveStage.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.liveStage.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.liveStage.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.liveStage.tags.0'),
      t('outputPanel.templates.liveStage.tags.1'),
      t('outputPanel.templates.liveStage.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.liveStage.settings.0.label'),
        value: t('outputPanel.templates.liveStage.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.liveStage.settings.1.label'),
        value: t('outputPanel.templates.liveStage.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.liveStage.settings.2.label'),
        value: t('outputPanel.templates.liveStage.settings.2.value'),
      },
      {
        label: t('outputPanel.templates.liveStage.settings.3.label'),
        value: t('outputPanel.templates.liveStage.settings.3.value'),
      },
      {
        label: t('outputPanel.templates.liveStage.settings.4.label'),
        value: t('outputPanel.templates.liveStage.settings.4.value'),
      },
    ],
  },
  {
    id: 'art-card',
    kind: 'now-playing',
    order: 10,
    name: t('outputPanel.templates.artCard.name'),
    availability: {
      summary: t('outputPanel.templates.artCard.availability.summary'),
    },
    summary: t('outputPanel.templates.artCard.summary'),
    detail: t('outputPanel.templates.artCard.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.artCard.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.artCard.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.artCard.tags.0'),
      t('outputPanel.templates.artCard.tags.1'),
      t('outputPanel.templates.artCard.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.artCard.settings.0.label'),
        value: t('outputPanel.templates.artCard.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.artCard.settings.1.label'),
        value: t('outputPanel.templates.artCard.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.artCard.settings.2.label'),
        value: t('outputPanel.templates.artCard.settings.2.value'),
      },
    ],
  },
  {
    id: 'cover-player',
    kind: 'now-playing',
    order: 30,
    name: t('outputPanel.templates.coverPlayer.name'),
    availability: {
      summary: t('outputPanel.templates.coverPlayer.availability.summary'),
    },
    summary: t('outputPanel.templates.coverPlayer.summary'),
    detail: t('outputPanel.templates.coverPlayer.detail'),
    preview: {
      layoutLabel: t('outputPanel.templates.coverPlayer.preview.layoutLabel'),
      motionLabel: t('outputPanel.templates.coverPlayer.preview.motionLabel'),
    },
    tags: [
      t('outputPanel.templates.coverPlayer.tags.0'),
      t('outputPanel.templates.coverPlayer.tags.1'),
      t('outputPanel.templates.coverPlayer.tags.2'),
    ],
    settings: [
      {
        label: t('outputPanel.templates.coverPlayer.settings.0.label'),
        value: t('outputPanel.templates.coverPlayer.settings.0.value'),
      },
      {
        label: t('outputPanel.templates.coverPlayer.settings.1.label'),
        value: t('outputPanel.templates.coverPlayer.settings.1.value'),
      },
      {
        label: t('outputPanel.templates.coverPlayer.settings.2.label'),
        value: t('outputPanel.templates.coverPlayer.settings.2.value'),
      },
    ],
  },
];

const EMPTY_PRESENTATION_FIELDS = Object.freeze([]);
const CONTENT_CONFIGURATION_GROUP = Object.freeze({
  id: 'template-presentation',
  label: t('outputPanel.presentationGroup'),
  order: 90,
});

function presentationFieldsForTemplate(templateId) {
  const options = lyricsPresentationPolicyOptionsForTemplate(templateId);
  if (options.length === 0) return EMPTY_PRESENTATION_FIELDS;
  return Object.freeze([
    Object.freeze({
      key: 'lyricsPresentationPolicyId',
      label: t('outputPanel.presentationPolicy'),
      control: 'select',
      settingKind: 'lyrics-presentation',
      family: 'document',
      tier: 'basic',
      reflow: true,
      scope: 'template',
      group: CONTENT_CONFIGURATION_GROUP.id,
      groupLabel: CONTENT_CONFIGURATION_GROUP.label,
      groupOrder: CONTENT_CONFIGURATION_GROUP.order,
      order: 20,
      defaultValue: normalizeLyricsPresentationPolicyId(templateId),
      options: Object.freeze(
        options.map((option) =>
          Object.freeze({ ...option, label: lyricsPolicyLabel(option.id) }),
        ),
      ),
    }),
  ]);
}

const DEFAULT_TEMPLATE_IDS = new Set(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => slot.defaultTemplateId),
);

// Labels follow state: each slot's default is 建議, the rest are 可用.
function availabilityForTemplate(template, available = true) {
  const status = !available
    ? {
        status: 'unavailable',
        label: t('outputPanel.availability.unavailable'),
        tone: 'warning',
      }
    : DEFAULT_TEMPLATE_IDS.has(template.id)
      ? {
          status: 'recommended',
          label: t('outputPanel.availability.recommended'),
          tone: 'accent',
        }
      : {
          status: 'available',
          label: t('outputPanel.availability.available'),
          tone: 'muted',
        };
  return Object.freeze({ ...template.availability, ...status, available });
}

export const OUTPUT_TEMPLATES = Object.freeze(
  OUTPUT_TEMPLATE_DEFINITIONS.map((template) => {
    const appearanceFields = outputAppearanceFieldsForTemplate(template.id).map(
      localizeAppearanceField,
    );
    const presentationFields = presentationFieldsForTemplate(template.id);
    const elementTargets = outputElementTargetsForTemplate(template.id).map(
      localizeElementTarget,
    );
    if (template.kind !== 'lyrics') {
      return Object.freeze({
        ...template,
        availability: availabilityForTemplate(template),
        appearanceFields,
        presentationFields,
        elementTargets,
      });
    }
    const presentationProfile = lyricsPresentationProfileForTemplate(
      template.id,
    );
    return Object.freeze({
      ...template,
      availability: availabilityForTemplate(
        template,
        presentationProfile.available,
      ),
      editableAppearanceKeys: [...presentationProfile.editableAppearanceKeys],
      appearanceFields,
      presentationFields,
      elementTargets,
      lyricsCapabilities: lyricsTemplateCapabilities(template.id),
      presentationProfile,
    });
  }),
);

export const OUTPUT_SLOT_DEFINITIONS = Object.freeze(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => ({
    id: slot.id,
    label: outputSlotLabel(slot.id),
    path: slot.path,
  })),
);

export const OUTPUT_SLOT_DEFAULTS = Object.freeze(
  Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [
      slot.id,
      {
        templateId: slot.defaultTemplateId,
        styleSetIds: [...slot.defaultStyleSetIds],
        settings: {
          ...(OUTPUT_SLOT_APPEARANCE_DEFAULTS[slot.id] ??
            OUTPUT_APPEARANCE_DEFAULTS),
          captureSize: defaultCaptureSizeIdForKind(slot.id),
        },
      },
    ]),
  ),
);

function normalizeOrder(value) {
  return Number.isFinite(value) ? value : 100;
}

function kindRank(kind) {
  return OUTPUT_KIND_ORDER.has(kind)
    ? OUTPUT_KIND_ORDER.get(kind)
    : OUTPUT_KIND_ORDER.size;
}

function labelForKind(kind) {
  return (
    OUTPUT_TEMPLATE_KINDS.find((entry) => entry.id === kind)?.label ??
    kind
      .split('-')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function orderOutputTemplates(templates) {
  return [...templates].sort((a, b) => {
    const kindDelta = kindRank(a.kind) - kindRank(b.kind);
    if (kindDelta !== 0) return kindDelta;

    const orderDelta = normalizeOrder(a.order) - normalizeOrder(b.order);
    if (orderDelta !== 0) return orderDelta;

    return a.name.localeCompare(b.name, UI_LOCALE);
  });
}

export function groupOutputTemplatesByKind(templates = OUTPUT_TEMPLATES) {
  const groups = new Map();

  for (const template of orderOutputTemplates(templates)) {
    if (!groups.has(template.kind)) groups.set(template.kind, []);
    groups.get(template.kind).push(template);
  }

  return [...groups.entries()].map(([kind, items]) => ({
    kind,
    label: labelForKind(kind),
    templates: items,
  }));
}

export function getOutputWorkbenchData() {
  return {
    templates: orderOutputTemplates(OUTPUT_TEMPLATES),
    templateGroups: groupOutputTemplatesByKind(OUTPUT_TEMPLATES),
    previewScene: structuredClone(OUTPUT_PREVIEW_SCENE),
    slotDefinitions: [...OUTPUT_SLOT_DEFINITIONS],
    slotDefaults: structuredClone(OUTPUT_SLOT_DEFAULTS),
  };
}
