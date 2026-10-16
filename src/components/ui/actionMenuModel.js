/**
 * @typedef {'sm' | 'md' | 'lg'} ActionMenuSize
 * @typedef {'default' | 'danger'} ActionMenuIntent
 *
 * @typedef {object} ActionMenuAction
 * @property {string} id
 * @property {'action'} kind
 * @property {string} label
 * @property {unknown} [value]
 * @property {unknown} [icon]
 * @property {boolean} [disabled]
 * @property {string} [disabledReason]
 * @property {ActionMenuIntent} [intent]
 * @property {string} [shortcut]
 * @property {string[]} [keywords]
 *
 * @typedef {object} ActionMenuSubmenu
 * @property {string} id
 * @property {'submenu'} kind
 * @property {string} label
 * @property {unknown} [icon]
 * @property {boolean} [disabled]
 * @property {string} [disabledReason]
 * @property {ActionMenuSize} [size]
 * @property {ActionMenuContent} content
 *
 * @typedef {ActionMenuAction | ActionMenuSubmenu} ActionMenuItem
 *
 * @typedef {object} ActionMenuGroup
 * @property {string} id
 * @property {ActionMenuItem[]} items
 *
 * @typedef {object} ActionMenuActionsContent
 * @property {'actions'} kind
 * @property {ActionMenuGroup[]} groups
 * @property {string} [emptyText]
 *
 * @typedef {object} ActionMenuFilterableContent
 * @property {'filterable-actions'} kind
 * @property {{ label: string, placeholder: string }} search
 * @property {ActionMenuAction[]} [pinnedItems]
 * @property {ActionMenuGroup[]} groups
 * @property {string} [emptyText]
 * @property {string} [noResultsText]
 *
 * @typedef {ActionMenuActionsContent | ActionMenuFilterableContent} ActionMenuContent
 */

export const ACTION_MENU_SIZE_PX = Object.freeze({
  sm: 184,
  md: 220,
  lg: 240,
});

/**
 * @param {ActionMenuSize} [size]
 * @returns {number}
 */
export function actionMenuWidth(size = 'md') {
  const width = ACTION_MENU_SIZE_PX[size];
  if (!width) throw new TypeError(`Unsupported action menu size: ${size}`);
  return width;
}

function assertContent(content) {
  if (!['actions', 'filterable-actions'].includes(content?.kind)) {
    throw new TypeError(
      'Action menu content.kind must be actions or filterable-actions.',
    );
  }
}

function normalizedSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase();
}

function itemMatches(item, normalizedQuery) {
  if (!normalizedQuery) return true;
  const searchText = [item.label, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
  return searchText.includes(normalizedQuery);
}

function nonEmptyGroups(groups) {
  return (groups ?? []).filter((group) => group.items?.length);
}

function entriesFor(groups) {
  const entries = [];
  for (const [index, group] of groups.entries()) {
    if (index > 0) {
      const previous = groups[index - 1];
      entries.push({
        kind: 'separator',
        id: `separator:${previous.id}:${group.id}`,
      });
    }
    entries.push(...group.items);
  }
  return entries;
}

/**
 * Converts a content recipe to the rendered sequence. Separators are derived
 * from non-empty groups so callers cannot create leading or trailing dividers.
 *
 * @param {ActionMenuContent} content
 * @param {string} [query]
 */
export function actionMenuPresentation(content, query = '') {
  assertContent(content);

  if (content.kind === 'actions') {
    const groups = nonEmptyGroups(content.groups);
    const entries = entriesFor(groups);
    return {
      entries,
      focusableItems: entries.filter((entry) => entry.kind !== 'separator'),
      emptyText: entries.length === 0 ? (content.emptyText ?? '') : '',
    };
  }

  const normalizedQuery = normalizedSearchText(query);
  const sourceGroups = content.groups ?? [];
  const sourceItemCount = sourceGroups.reduce(
    (count, group) => count + (group.items?.length ?? 0),
    0,
  );
  const resultGroups = nonEmptyGroups(
    sourceGroups.map((group) => ({
      ...group,
      items: (group.items ?? []).filter((item) =>
        itemMatches(item, normalizedQuery),
      ),
    })),
  );
  const resultItemCount = resultGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );
  const groups = [
    ...(content.pinnedItems?.length
      ? [{ id: 'pinned', items: content.pinnedItems }]
      : []),
    ...resultGroups,
  ];
  const entries = entriesFor(groups);
  const emptyText =
    resultItemCount > 0
      ? ''
      : normalizedQuery && sourceItemCount > 0
        ? (content.noResultsText ?? content.emptyText ?? '')
        : (content.emptyText ?? '');

  return {
    entries,
    focusableItems: entries.filter((entry) => entry.kind !== 'separator'),
    emptyText,
  };
}
