import {
  normalizeTrackCollectionPreferences,
  trackCollectionColumns,
  trackCollectionColumnWidth,
  trackCollectionProfile,
} from './trackCollectionProfiles.js';

// These mirror --ui-track-row-gap and both --ui-track-row-padding-inline
// edges before the rendered header can provide computed token values.
export const TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS = Object.freeze({
  columnGap: 8,
  inlinePadding: 24,
});

const SPACER_COLUMN = Object.freeze({
  role: 'spacer',
  label: '',
  sortKey: null,
  priority: 'structural',
  align: 'start',
  resizable: false,
});

const SHRINK_PRIORITY = Object.freeze({
  advanced: 0,
  supplemental: 1,
  release: 2,
  identity: 3,
  ordinal: 4,
  duration: 5,
  essential: 6,
});

function columnShrinkPriority(column) {
  return (
    SHRINK_PRIORITY[column.role] ??
    SHRINK_PRIORITY[column.priority] ??
    SHRINK_PRIORITY.essential
  );
}

function insertSpacer(columns) {
  const trailingIndex = columns.findIndex((column) =>
    ['duration', 'performanceStatus', 'performanceActions', 'actions'].includes(
      column.role,
    ),
  );
  const index = trailingIndex >= 0 ? trailingIndex : columns.length;
  return Object.freeze([
    ...columns.slice(0, index),
    SPACER_COLUMN,
    ...columns.slice(index),
  ]);
}

function requiredWidth(columns, widths, columnGap, inlinePadding) {
  const trackWidth = columns.reduce(
    (total, column) => total + (widths[column.role] ?? 0),
    0,
  );
  return (
    trackWidth + Math.max(0, columns.length - 1) * columnGap + inlinePadding
  );
}

export function resolveTrackCollectionResizeBounds({
  startWidth,
  minWidth,
  maxWidth,
  availableWidth,
  requiredWidth: currentRequiredWidth,
}) {
  const normalizedMin = Number.isFinite(minWidth) ? minWidth : 0;
  const normalizedMax = Number.isFinite(maxWidth)
    ? Math.max(normalizedMin, maxWidth)
    : Number.POSITIVE_INFINITY;
  const boundedStart = Math.min(
    normalizedMax,
    Math.max(normalizedMin, Number.isFinite(startWidth) ? startWidth : 0),
  );
  const availableGrowth =
    Number.isFinite(availableWidth) && Number.isFinite(currentRequiredWidth)
      ? Math.max(0, availableWidth - currentRequiredWidth)
      : normalizedMax - boundedStart;
  return Object.freeze({
    minWidth: normalizedMin,
    maxWidth: Math.max(
      normalizedMin,
      Math.min(normalizedMax, boundedStart + availableGrowth),
    ),
  });
}

export function resolveTrackCollectionResizeWidth({
  startWidth,
  delta,
  direction = 'ltr',
  minWidth,
  maxWidth,
}) {
  const physicalDelta = Number.isFinite(delta) ? delta : 0;
  const logicalDelta = direction === 'rtl' ? -physicalDelta : physicalDelta;
  return Math.min(
    maxWidth,
    Math.max(minWidth, Math.round(startWidth + logicalDelta)),
  );
}

function shrinkToFit({
  kind,
  columns,
  widths,
  overriddenRoles,
  availableWidth,
  columnGap,
  inlinePadding,
}) {
  const nextWidths = { ...widths };
  let overflow =
    requiredWidth(columns, nextWidths, columnGap, inlinePadding) -
    availableWidth;
  if (!(overflow > 0)) return nextWidths;

  const shrinkable = columns
    .filter((column) => {
      const contract = trackCollectionColumnWidth(kind, column.role);
      return contract && nextWidths[column.role] > contract.minWidth;
    })
    .sort((left, right) => {
      const leftOverridden = overriddenRoles.has(left.role) ? 1 : 0;
      const rightOverridden = overriddenRoles.has(right.role) ? 1 : 0;
      if (leftOverridden !== rightOverridden) {
        return leftOverridden - rightOverridden;
      }
      return columnShrinkPriority(left) - columnShrinkPriority(right);
    })
    .map((column) => column.role);

  for (const role of shrinkable) {
    if (overflow <= 0) break;
    const contract = trackCollectionColumnWidth(kind, role);
    const available = nextWidths[role] - contract.minWidth;
    const reduction = Math.min(available, overflow);
    nextWidths[role] -= reduction;
    overflow -= reduction;
  }
  return nextWidths;
}

function distributeDefaultWidths({
  kind,
  columns,
  widths,
  availableWidth,
  columnGap,
  inlinePadding,
}) {
  if (!Number.isFinite(availableWidth)) return widths;
  const surplus =
    availableWidth - requiredWidth(columns, widths, columnGap, inlinePadding);
  if (!(surplus > 0)) return widths;

  const candidates = columns.filter(
    (column) => column.resizable && column.distributionWeight > 0,
  );
  const totalWeight = candidates.reduce(
    (total, column) => total + column.distributionWeight,
    1,
  );
  const nextWidths = { ...widths };
  for (const column of candidates) {
    const contract = trackCollectionColumnWidth(kind, column.role);
    const share = Math.floor(
      (surplus * column.distributionWeight) / totalWeight,
    );
    nextWidths[column.role] = Math.min(
      contract.maxWidth,
      nextWidths[column.role] + share,
    );
  }
  return nextWidths;
}

function collapseOrder(kind, normalizedPreferences) {
  const profile = trackCollectionProfile(kind);
  const visibleAdvanced = profile.advancedColumns
    .map((column) => column.role)
    .filter((role) => normalizedPreferences.visibleAdvanced.includes(role))
    .reverse();
  const supplementalDefaults = profile.semanticColumns
    .filter((column) => column.priority === 'supplemental')
    .map((column) => column.role)
    .reverse();
  return [
    ...visibleAdvanced,
    ...supplementalDefaults,
    'release',
    'duration',
    ...(profile.managedActions ? ['performanceStatus'] : []),
    ...(profile.readOnly || profile.managedActions ? ['ordinal'] : []),
  ].filter((role, index, roles) => roles.indexOf(role) === index);
}

function templateFor(columns, widths, fillIdentity = false) {
  return columns
    .map((column) =>
      column.role === 'identity' && fillIdentity
        ? `minmax(${widths.identity}px, 1fr)`
        : column.role === 'spacer'
          ? fillIdentity
            ? '0px'
            : 'minmax(0, 1fr)'
          : `${widths[column.role]}px`,
    )
    .join(' ');
}

export function resolveTrackCollectionLayout({
  kind,
  preferences = {},
  availableWidth = Number.POSITIVE_INFINITY,
  lockedRoles = null,
  columnGap = TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS.columnGap,
  inlinePadding = TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS.inlinePadding,
} = {}) {
  const normalizedPreferences = normalizeTrackCollectionPreferences(
    kind,
    preferences,
  );
  const desiredColumns = trackCollectionColumns(kind, normalizedPreferences);
  const preferredWidths = Object.fromEntries(
    desiredColumns.map((column) => [
      column.role,
      trackCollectionColumnWidth(kind, column.role, normalizedPreferences)
        .width,
    ]),
  );
  const finiteAvailableWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : Number.POSITIVE_INFINITY;
  const lockedRoleSet = Array.isArray(lockedRoles)
    ? new Set(lockedRoles)
    : null;
  const candidates = collapseOrder(kind, normalizedPreferences);
  const hiddenForWidth = lockedRoleSet
    ? candidates.filter(
        (role) =>
          desiredColumns.some((column) => column.role === role) &&
          !lockedRoleSet.has(role),
      )
    : [];
  let activeColumns = lockedRoleSet
    ? desiredColumns.filter((column) => lockedRoleSet.has(column.role))
    : [...desiredColumns];
  let columnsWithSpacer;
  let widths;
  let resolvedRequiredWidth;
  const overriddenRoles = new Set(Object.keys(normalizedPreferences.widths));

  while (true) {
    columnsWithSpacer = insertSpacer(activeColumns);
    widths = shrinkToFit({
      kind,
      columns: columnsWithSpacer,
      widths: preferredWidths,
      overriddenRoles,
      availableWidth: finiteAvailableWidth,
      columnGap,
      inlinePadding,
    });
    resolvedRequiredWidth = requiredWidth(
      columnsWithSpacer,
      widths,
      columnGap,
      inlinePadding,
    );
    if (resolvedRequiredWidth <= finiteAvailableWidth) break;
    const role = candidates.find((candidate) =>
      activeColumns.some((column) => column.role === candidate),
    );
    if (!role) break;
    activeColumns = activeColumns.filter((column) => column.role !== role);
    hiddenForWidth.push(role);
  }

  if (overriddenRoles.size === 0) {
    widths = distributeDefaultWidths({
      kind,
      columns: columnsWithSpacer,
      widths,
      availableWidth: finiteAvailableWidth,
      columnGap,
      inlinePadding,
    });
    resolvedRequiredWidth = requiredWidth(
      columnsWithSpacer,
      widths,
      columnGap,
      inlinePadding,
    );
  }

  return Object.freeze({
    columns: columnsWithSpacer,
    widths: Object.freeze(widths),
    gridTemplate: templateFor(
      columnsWithSpacer,
      widths,
      trackCollectionProfile(kind).fillIdentity,
    ),
    hiddenForWidth: Object.freeze(hiddenForWidth),
    requiredWidth: resolvedRequiredWidth,
    preferences: normalizedPreferences,
  });
}
