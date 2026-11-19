import {
  Eye,
  Grid2X2,
  LocateFixed,
  Palette,
  Repeat,
  Type,
  UserRound,
} from '../icons/index.js';
import { t } from './i18n.js';

const anchorKeys = ['positionAnchor'];
const offsetKeys = ['positionOffsetX', 'positionOffsetY'];

export function sortOutputInspectorFields(fields) {
  return [...fields].sort(
    (left, right) =>
      (left.groupOrder ?? 100) - (right.groupOrder ?? 100) ||
      (left.order ?? 100) - (right.order ?? 100) ||
      left.key.localeCompare(right.key),
  );
}

const categories = [
  { id: 'motion', icon: Repeat, groups: [{ id: 'motion' }] },
  {
    id: 'display',
    icon: Eye,
    groups: [{ id: 'template-presentation' }, { id: 'content' }],
  },
  {
    id: 'layout',
    icon: LocateFixed,
    groups: [
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
      { id: 'layout', excludeKeys: [...anchorKeys, ...offsetKeys] },
    ],
  },
  {
    id: 'text',
    icon: Type,
    groups: [{ id: 'typography' }, { id: 'readability' }],
  },
  { id: 'portrait', icon: UserRound, groups: [{ id: 'portrait' }] },
  {
    id: 'color',
    icon: Palette,
    groups: [
      { id: 'color-treatment' },
      { id: 'custom-color' },
      { id: 'surface' },
      { id: 'decoration' },
      { id: 'material' },
    ],
  },
];

export function outputInspectorTabs(fields) {
  return categories.flatMap(({ id, icon, groups }) => {
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
            fields: matches,
          },
        ];
      },
    );
    if (!availableGroups.length) return [];
    const hasArrangement =
      id === 'layout' && availableGroups.some((group) => group.id === 'layout');
    const tabId = hasArrangement ? 'arrangement' : id;
    return [
      {
        id: tabId,
        icon: hasArrangement ? Grid2X2 : icon,
        label: t(`outputPanel.inspector.${tabId}`),
        groups: availableGroups,
      },
    ];
  });
}
