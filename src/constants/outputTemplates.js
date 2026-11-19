import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import {
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  outputAppearanceFieldsForTemplate,
  outputElementTargetsForTemplate,
} from '../../shared/outputAppearance.mjs';
import { lyricsPresentationProfileForTemplate } from '../../shared/presentation/lyricsPresentation.mjs';
import { lyricsPresentationFieldsForTemplate } from '../../shared/presentation/lyricsPresentationPolicies.mjs';
import { lyricsTemplateCapabilities } from '../../shared/presentation/lyricsTemplateCapabilities.mjs';
import { defaultCaptureSizeIdForKind } from './outputCaptureSizes.js';
import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';
import {
  localizeAppearanceField,
  localizeElementTarget,
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

const FACT_LABELS = Object.freeze({
  direction: t('outputPanel.gallery.facts.direction'),
  language: t('outputPanel.gallery.facts.language'),
  translation: t('outputPanel.gallery.facts.translation'),
  content: t('outputPanel.gallery.facts.content'),
  paging: t('outputPanel.gallery.facts.paging'),
  artwork: t('outputPanel.gallery.facts.artwork'),
  progress: t('outputPanel.gallery.facts.progress'),
});

function templateFacts(entries) {
  return entries.map(([key, value]) => ({
    key,
    label: FACT_LABELS[key],
    value,
  }));
}

// The gallery preview shows look and motion. Facts state what it cannot,
// with the same short fields per kind, ordered by what a user checks first.
const OUTPUT_TEMPLATE_DEFINITIONS = [
  {
    id: 'ribbon-setlist',
    kind: 'setlist',
    order: 30,
    name: t('outputPanel.templates.ribbonSetlist.name'),
    facts: templateFacts([
      ['content', t('outputPanel.templates.ribbonSetlist.facts.content')],
      ['paging', t('outputPanel.templates.ribbonSetlist.facts.paging')],
    ]),
  },
  {
    id: 'receipt-setlist',
    kind: 'setlist',
    order: 10,
    name: t('outputPanel.templates.receiptSetlist.name'),
    facts: templateFacts([
      ['content', t('outputPanel.templates.receiptSetlist.facts.content')],
      ['paging', t('outputPanel.templates.receiptSetlist.facts.paging')],
    ]),
  },
  {
    id: 'queue-board',
    kind: 'setlist',
    order: 20,
    name: t('outputPanel.templates.queueBoard.name'),
    facts: templateFacts([
      ['content', t('outputPanel.templates.queueBoard.facts.content')],
      ['paging', t('outputPanel.templates.queueBoard.facts.paging')],
    ]),
  },
  {
    id: 'karaoke-stack',
    kind: 'lyrics',
    order: 10,
    name: t('outputPanel.templates.karaokeStack.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.karaokeStack.facts.direction')],
      ['language', t('outputPanel.templates.karaokeStack.facts.language')],
      [
        'translation',
        t('outputPanel.templates.karaokeStack.facts.translation'),
      ],
    ]),
  },
  {
    id: 'manga-frame',
    kind: 'lyrics',
    order: 30,
    name: t('outputPanel.templates.mangaFrame.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.mangaFrame.facts.direction')],
      ['language', t('outputPanel.templates.mangaFrame.facts.language')],
      ['translation', t('outputPanel.templates.mangaFrame.facts.translation')],
    ]),
  },
  {
    id: 'kinetic-pop',
    kind: 'lyrics',
    order: 25,
    name: t('outputPanel.templates.kineticPop.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.kineticPop.facts.direction')],
      ['language', t('outputPanel.templates.kineticPop.facts.language')],
      ['translation', t('outputPanel.templates.kineticPop.facts.translation')],
    ]),
  },
  {
    id: 'ornate-vertical',
    kind: 'lyrics',
    order: 28,
    name: t('outputPanel.templates.ornateVertical.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.ornateVertical.facts.direction')],
      ['language', t('outputPanel.templates.ornateVertical.facts.language')],
      [
        'translation',
        t('outputPanel.templates.ornateVertical.facts.translation'),
      ],
    ]),
  },
  {
    id: 'centered-vertical',
    kind: 'lyrics',
    order: 31,
    name: t('outputPanel.templates.centeredVertical.name'),
    facts: templateFacts([
      [
        'direction',
        t('outputPanel.templates.centeredVertical.facts.direction'),
      ],
      ['language', t('outputPanel.templates.centeredVertical.facts.language')],
      [
        'translation',
        t('outputPanel.templates.centeredVertical.facts.translation'),
      ],
    ]),
  },
  {
    id: 'chalkboard-vertical',
    kind: 'lyrics',
    order: 29,
    name: t('outputPanel.templates.chalkboardVertical.name'),
    facts: templateFacts([
      [
        'direction',
        t('outputPanel.templates.chalkboardVertical.facts.direction'),
      ],
      [
        'language',
        t('outputPanel.templates.chalkboardVertical.facts.language'),
      ],
      [
        'translation',
        t('outputPanel.templates.chalkboardVertical.facts.translation'),
      ],
    ]),
  },
  {
    id: 'live-stage',
    kind: 'lyrics',
    order: 20,
    name: t('outputPanel.templates.liveStage.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.liveStage.facts.direction')],
      ['language', t('outputPanel.templates.liveStage.facts.language')],
      ['translation', t('outputPanel.templates.liveStage.facts.translation')],
    ]),
  },
  {
    id: 'fisheye-lens',
    kind: 'lyrics',
    order: 60,
    name: t('outputPanel.templates.fisheyeLens.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.fisheyeLens.facts.direction')],
      ['language', t('outputPanel.templates.fisheyeLens.facts.language')],
      ['translation', t('outputPanel.templates.fisheyeLens.facts.translation')],
    ]),
  },
  {
    id: 'phantom-thieves',
    kind: 'lyrics',
    order: 65,
    name: t('outputPanel.templates.phantomThieves.name'),
    facts: templateFacts([
      ['direction', t('outputPanel.templates.phantomThieves.facts.direction')],
      ['language', t('outputPanel.templates.phantomThieves.facts.language')],
      [
        'translation',
        t('outputPanel.templates.phantomThieves.facts.translation'),
      ],
    ]),
  },
  {
    id: 'art-card',
    kind: 'now-playing',
    order: 10,
    name: t('outputPanel.templates.artCard.name'),
    facts: templateFacts([
      ['artwork', t('outputPanel.templates.artCard.facts.artwork')],
      ['progress', t('outputPanel.templates.artCard.facts.progress')],
    ]),
  },
  {
    id: 'ticket-stub',
    kind: 'now-playing',
    order: 20,
    name: t('outputPanel.templates.ticketStub.name'),
    facts: templateFacts([
      ['artwork', t('outputPanel.templates.ticketStub.facts.artwork')],
      ['progress', t('outputPanel.templates.ticketStub.facts.progress')],
    ]),
  },
  {
    id: 'cover-player',
    kind: 'now-playing',
    order: 30,
    name: t('outputPanel.templates.coverPlayer.name'),
    facts: templateFacts([
      ['artwork', t('outputPanel.templates.coverPlayer.facts.artwork')],
      ['progress', t('outputPanel.templates.coverPlayer.facts.progress')],
    ]),
  },
];

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
    const presentationFields = deepFreeze(
      lyricsPresentationFieldsForTemplate(template.id).map(
        localizeAppearanceField,
      ),
    );
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
