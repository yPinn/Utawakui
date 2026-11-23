import {
  Activity,
  Eye,
  Film,
  Languages,
  LayoutTemplate,
  LocateFixed,
  MessageSquare,
  Palette,
  Sparkles,
  Type,
  UserRound,
  Video,
} from '../icons/index.js';
import { isSharedOutputAppearanceField } from '../../shared/outputAppearance.mjs';
import { t } from './i18n.js';

const anchorKeys = ['positionAnchor'];
const offsetKeys = ['positionOffsetX', 'positionOffsetY'];

const tabDefinitions = [
  ['display', Eye, 'strong'],
  ['text', Type, 'strong'],
  ['manga-bubbles', MessageSquare, 'medium', 'mangaBubbles.label'],
  ['camera-effects', Video, 'medium', 'inspector.effects'],
  ['portrait', UserRound, 'medium'],
  ['translation', Languages, 'medium'],
  ['color', Palette, 'soft'],
  ['decoration', Sparkles, 'soft'],
  ['motion', Activity, 'soft'],
  ['layout', LayoutTemplate, 'soft'],
  ['performer-guide', LocateFixed, 'soft', 'inspector.placement'],
  ['template-filmstrip', Film, 'neutral', 'inspector.templates'],
];
const outputInspectorTabDetails = new Map(
  tabDefinitions.map(([id, icon, folderShade, labelKey], rank) => [
    id,
    { rank, icon, folderShade, labelKey: labelKey ?? `inspector.${id}` },
  ]),
);

export function outputInspectorTab(id, { groups = [], folderTone } = {}) {
  const { icon, folderShade, labelKey } = outputInspectorTabDetails.get(id);
  return {
    id,
    icon,
    folderShade,
    label: t(`outputPanel.${labelKey}`),
    groups,
    folderTone,
  };
}

export function sortOutputInspectorTabs(tabs) {
  return [...tabs].sort(
    (left, right) =>
      outputInspectorTabDetails.get(left.id).rank -
      outputInspectorTabDetails.get(right.id).rank,
  );
}

export function sortOutputInspectorFields(fields) {
  return [...fields].sort(
    (left, right) =>
      (left.groupOrder ?? 100) - (right.groupOrder ?? 100) ||
      (left.order ?? 100) - (right.order ?? 100) ||
      left.key.localeCompare(right.key),
  );
}

const categories = [
  { id: 'motion', groups: [{ id: 'motion' }] },
  {
    id: 'display',
    groups: [{ id: 'template-presentation' }, { id: 'content' }],
  },
  {
    id: 'layout',
    groups: [
      { id: 'layout', excludeKeys: [...anchorKeys, ...offsetKeys] },
      {
        id: 'layout',
        tier: 'basic',
        label: 'anchor',
        keys: anchorKeys,
      },
      {
        id: 'layout',
        tier: 'advanced',
        label: 'offset',
        keys: offsetKeys,
      },
    ],
  },
  {
    id: 'decoration',
    groups: [
      { id: 'custom-color' },
      { id: 'surface' },
      { id: 'decoration' },
      { id: 'typography', keys: ['phantomRansomFont'] },
      { id: 'readability', keys: ['textShadow'] },
    ],
  },
  { id: 'portrait', groups: [{ id: 'portrait' }] },
  {
    id: 'text',
    groups: [
      { id: 'typography', excludeKeys: ['phantomRansomFont'] },
      { id: 'readability', excludeKeys: ['textShadow'] },
    ],
  },
  {
    id: 'color',
    groups: [{ id: 'color-treatment' }, { id: 'material' }],
  },
];

const singleFieldDestinations = {
  lyricsPresentationPolicyId: 'text',
  furigana: 'text',
  fisheyeGranularity: 'layout',
  kineticArrangement: 'text',
  alignment: 'text',
  phantomRansomFont: 'layout',
  receiptDirection: 'motion',
  textColor: 'color',
  surface: 'color',
  vinylSurfaceLight: 'color',
  fontFamily: 'color',
};

function singleField(tab) {
  if (tab.groups.length !== 1 || tab.groups[0].fields.length !== 1) return null;
  return tab.groups[0].fields[0];
}

function mergeSingleFieldTabs(tabs) {
  const merged = new Map();
  const layout = tabs.find(({ id }) => id === 'layout');
  const isDensityLayout =
    layout && singleField(layout)?.key === 'spacingDensity';
  for (const [index, tab] of tabs.entries()) {
    const field = singleField(tab);
    if (!field) continue;
    let destination = singleFieldDestinations[field.key];
    if (field.key === 'surface' && isDensityLayout) destination = 'layout';
    if (field.scope === 'element' && field.propertyKey === 'visible')
      destination = 'text';
    const target = tabs.find(({ id }) => id === destination);
    if (!target || target === tab || merged.has(target)) continue;

    if (index === 0) target.groups.unshift(...tab.groups);
    else target.groups.push(...tab.groups);
    merged.set(tab, target);
  }
  return [...new Set(tabs.map((tab) => merged.get(tab) ?? tab))];
}

export function outputInspectorTabs(fields) {
  const tabs = categories.flatMap(({ id, groups }) => {
    const availableGroups = groups.flatMap(
      ({ id: group, tier, label, keys, excludeKeys }) => {
        const matches = fields.filter(
          (field) =>
            field.group === group &&
            (!tier || field.tier === tier) &&
            (!keys || keys.includes(field.key)) &&
            !excludeKeys?.includes(field.key),
        );
        if (!matches.length) return [];
        return [
          {
            id: tier ? `${group}-${tier}` : group,
            label: label
              ? t(`outputPanel.inspector.${label}`)
              : matches[0].groupLabel,
            fields: sortOutputInspectorFields(matches),
          },
        ];
      },
    );
    if (!availableGroups.length) return [];
    return [outputInspectorTab(id, { groups: availableGroups })];
  });
  return mergeSingleFieldTabs(tabs).map((tab) => ({
    ...tab,
    ...(tab.groups.every(({ fields }) =>
      fields.every(isSharedOutputAppearanceField),
    ) && {
      folderTone: 'secondary',
    }),
  }));
}
