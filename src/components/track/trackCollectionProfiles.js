import { formatGroupedInteger } from '../../utils/format.js';

export const TRACK_COLLECTION_KINDS = Object.freeze([
  'library-all',
  'library-local',
  'playlist',
  'album',
  'artist',
]);

const CANONICAL_SEMANTIC_ROLES = Object.freeze([
  'release',
  'releaseYear',
  'membership',
  'imported',
  'usage',
]);
// Matches --ui-space-5: exactly one dense chooser／overflow control track.
const TRACK_ROW_UTILITY_LANE_WIDTH = 24;

const COLUMN_DEFINITIONS = Object.freeze({
  ordinal: Object.freeze({
    role: 'ordinal',
    label: '#',
    sortKey: null,
    priority: 'essential',
    align: 'center',
    headerAlign: 'center',
    numeric: true,
    defaultWidth: 40,
    minWidth: 32,
    maxWidth: 40,
    resizable: false,
  }),
  identity: Object.freeze({
    role: 'identity',
    label: '曲目',
    sortKey: 'title',
    priority: 'essential',
    align: 'start',
    headerAlign: 'start',
    distributionWeight: 2,
    sortIndicatorPlacement: 'after',
    defaultWidth: 320,
    minWidth: 128,
    maxWidth: 720,
    resizable: true,
  }),
  release: Object.freeze({
    role: 'release',
    label: '專輯',
    sortKey: 'album',
    priority: 'release',
    textField: 'releaseText',
    align: 'start',
    headerAlign: 'start',
    distributionWeight: 1,
    sortIndicatorPlacement: 'after',
    defaultWidth: 208,
    minWidth: 144,
    maxWidth: 480,
    resizable: true,
  }),
  releaseYear: Object.freeze({
    role: 'releaseYear',
    label: '發行年份',
    sortKey: 'releaseYear',
    priority: 'supplemental',
    textField: 'releaseYearText',
    align: 'start',
    headerAlign: 'start',
    numeric: true,
    distributionWeight: 1,
    sortIndicatorPlacement: 'after',
    defaultWidth: 96,
    minWidth: 88,
    maxWidth: 176,
    resizable: true,
  }),
  membership: Object.freeze({
    role: 'membership',
    label: '新增日期',
    sortKey: 'addedAt',
    priority: 'supplemental',
    textField: 'membershipText',
    align: 'start',
    headerAlign: 'start',
    distributionWeight: 1,
    sortIndicatorPlacement: 'after',
    defaultWidth: 128,
    minWidth: 112,
    maxWidth: 224,
    resizable: true,
  }),
  imported: Object.freeze({
    role: 'imported',
    label: '匯入日期',
    sortKey: 'importedAt',
    priority: 'advanced',
    textField: 'importedText',
    align: 'start',
    headerAlign: 'start',
    distributionWeight: 1,
    sortIndicatorPlacement: 'after',
    defaultWidth: 128,
    minWidth: 112,
    maxWidth: 224,
    resizable: true,
  }),
  usage: Object.freeze({
    role: 'usage',
    label: '播放次數',
    sortKey: 'playCount',
    priority: 'supplemental',
    textField: 'usageText',
    align: 'end',
    headerAlign: 'end',
    numeric: true,
    distributionWeight: 1,
    sortIndicatorPlacement: 'before',
    defaultWidth: 104,
    minWidth: 88,
    maxWidth: 192,
    resizable: true,
  }),
  duration: Object.freeze({
    role: 'duration',
    label: '時長',
    sortKey: 'duration',
    priority: 'duration',
    align: 'end',
    headerAlign: 'end',
    numeric: true,
    sortIndicatorPlacement: 'before',
    defaultWidth: 104,
    minWidth: 96,
    maxWidth: 104,
    resizable: false,
  }),
  actions: Object.freeze({
    role: 'actions',
    label: '操作',
    sortKey: null,
    priority: 'essential',
    align: 'end',
    headerAlign: 'end',
    defaultWidth: TRACK_ROW_UTILITY_LANE_WIDTH,
    minWidth: TRACK_ROW_UTILITY_LANE_WIDTH,
    maxWidth: TRACK_ROW_UTILITY_LANE_WIDTH,
    resizable: false,
  }),
});

function semanticColumns(...roles) {
  return Object.freeze(roles.map((role) => COLUMN_DEFINITIONS[role]));
}

const PROFILES = Object.freeze({
  'library-all': Object.freeze({
    kind: 'library-all',
    label: '全部曲目',
    description: '所有曲目，預設顯示專輯與播放次數。',
    accessibleLabel: '全部曲目',
    showArtwork: true,
    showArtist: true,
    semanticColumns: semanticColumns('release', 'usage'),
    advancedColumns: semanticColumns('releaseYear', 'imported'),
    lockedDefaultColumns: Object.freeze([]),
    toggleableDefaultColumns: Object.freeze([]),
    columnWidths: Object.freeze({ identity: 304, release: 224 }),
    ordinalMode: 'collection',
    albumNavigation: true,
    artistNavigation: true,
    canSortTrackRows: true,
    canReorderColumns: true,
    canReorderPlaylistTracks: false,
  }),
  'library-local': Object.freeze({
    kind: 'library-local',
    label: '本機檔案',
    description: '本機曲目，預設顯示專輯與播放次數。',
    accessibleLabel: '本機檔案曲目',
    showArtwork: true,
    showArtist: true,
    semanticColumns: semanticColumns('release', 'usage'),
    advancedColumns: semanticColumns('releaseYear', 'imported'),
    lockedDefaultColumns: Object.freeze([]),
    toggleableDefaultColumns: Object.freeze([]),
    columnWidths: Object.freeze({ identity: 304, release: 224 }),
    ordinalMode: 'collection',
    albumNavigation: true,
    artistNavigation: true,
    canSortTrackRows: true,
    canReorderColumns: true,
    canReorderPlaylistTracks: false,
  }),
  playlist: Object.freeze({
    kind: 'playlist',
    label: '播放清單',
    description: '播放清單曲目，預設只顯示必要欄位。',
    accessibleLabel: '播放清單曲目',
    showArtwork: true,
    showArtist: true,
    semanticColumns: semanticColumns(),
    advancedColumns: semanticColumns(
      'release',
      'membership',
      'usage',
      'releaseYear',
    ),
    lockedDefaultColumns: Object.freeze([]),
    toggleableDefaultColumns: Object.freeze([]),
    columnWidths: Object.freeze({ identity: 288 }),
    ordinalMode: 'collection',
    albumNavigation: true,
    artistNavigation: true,
    canSortTrackRows: true,
    canReorderColumns: true,
    canReorderPlaylistTracks: true,
  }),
  album: Object.freeze({
    kind: 'album',
    label: '專輯',
    description: '專輯曲目，預設顯示播放次數與時長。',
    accessibleLabel: '專輯曲目',
    showArtwork: false,
    showArtist: true,
    semanticColumns: semanticColumns('usage'),
    advancedColumns: semanticColumns('imported'),
    lockedDefaultColumns: Object.freeze(['usage']),
    toggleableDefaultColumns: Object.freeze([]),
    columnWidths: Object.freeze({ identity: 360 }),
    ordinalMode: 'source',
    albumNavigation: false,
    artistNavigation: true,
    canSortTrackRows: false,
    canReorderColumns: true,
    canReorderPlaylistTracks: false,
  }),
  artist: Object.freeze({
    kind: 'artist',
    label: '藝人',
    description: '藝人曲目，預設顯示播放次數與時長。',
    accessibleLabel: '藝人曲目',
    showArtwork: true,
    showArtist: false,
    semanticColumns: semanticColumns('usage'),
    advancedColumns: semanticColumns('release', 'releaseYear', 'imported'),
    lockedDefaultColumns: Object.freeze(['usage']),
    toggleableDefaultColumns: Object.freeze([]),
    columnWidths: Object.freeze({ identity: 288 }),
    ordinalMode: 'collection',
    albumNavigation: true,
    artistNavigation: false,
    canSortTrackRows: false,
    canReorderColumns: true,
    canReorderPlaylistTracks: false,
  }),
});

const DEFAULT_TRACK_COLLECTION_SORT = Object.freeze({
  key: null,
  direction: 'asc',
});
const TRACK_COLLECTION_SORT_KEYS = new Set(
  Object.values(COLUMN_DEFINITIONS)
    .map((column) => column.sortKey)
    .filter(Boolean),
);

function boundedPositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.min(Math.floor(numeric), Number.MAX_SAFE_INTEGER);
}

function optionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.min(Math.floor(numeric), Number.MAX_SAFE_INTEGER);
}

function canonicalReleaseYear(value) {
  const normalized = String(value ?? '').trim();
  return /^\d{4}$/u.test(normalized) ? normalized : '';
}

function collectionOrdinal(entry) {
  const index = Number(entry.visibleIndex);
  return String(
    (Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0) + 1,
  );
}

function sourceOrdinal(entry) {
  const trackNumber = boundedPositiveInteger(
    entry.trackNumber ?? entry.track?.trackNumber,
  );
  const discNumber = boundedPositiveInteger(
    entry.discNumber ?? entry.track?.discNumber,
  );
  if (!trackNumber) return collectionOrdinal(entry);
  return discNumber && discNumber > 1
    ? `${discNumber}-${trackNumber}`
    : String(trackNumber);
}

export function trackCollectionProfile(kind) {
  return PROFILES[kind] ?? PROFILES['library-all'];
}

export function trackCollectionAdvancedColumns(kind) {
  return trackCollectionProfile(kind).advancedColumns;
}

export function trackCollectionColumnChoices(kind) {
  const profile = trackCollectionProfile(kind);
  const lockedRoles = new Set(profile.lockedDefaultColumns);
  const toggleableDefaultRoles = new Set(profile.toggleableDefaultColumns);
  const defaultChoices = profile.semanticColumns.filter(
    (column) =>
      lockedRoles.has(column.role) || toggleableDefaultRoles.has(column.role),
  );
  return Object.freeze(
    [...defaultChoices, ...profile.advancedColumns].map((column) =>
      Object.freeze({
        ...column,
        defaultVisible: defaultChoices.includes(column),
        locked: lockedRoles.has(column.role),
      }),
    ),
  );
}

function allowedSemanticRoles(profile) {
  return new Set([
    ...profile.semanticColumns.map((column) => column.role),
    ...profile.advancedColumns.map((column) => column.role),
  ]);
}

function defaultSemanticOrder(profile) {
  return [
    ...profile.semanticColumns.map((column) => column.role),
    ...profile.advancedColumns.map((column) => column.role),
  ];
}

function normalizedSemanticOrder(profile, value) {
  if (!Array.isArray(value)) return null;
  const defaultOrder = defaultSemanticOrder(profile);
  const allowed = new Set(defaultOrder);
  const requested = value.filter(
    (role, index, roles) => allowed.has(role) && roles.indexOf(role) === index,
  );
  const completed = [
    ...requested,
    ...defaultOrder.filter((role) => !requested.includes(role)),
  ];
  return completed.every((role, index) => role === defaultOrder[index])
    ? null
    : completed;
}

function allowedResizableRoles(profile) {
  const semanticRoles = allowedSemanticRoles(profile);
  return ['identity', ...CANONICAL_SEMANTIC_ROLES].filter((role) => {
    const column = COLUMN_DEFINITIONS[role];
    return (
      column?.resizable && (role === 'identity' || semanticRoles.has(role))
    );
  });
}

function boundedColumnWidth(value, column, defaultWidth) {
  if (!Number.isFinite(value)) return defaultWidth;
  return Math.min(
    column.maxWidth,
    Math.max(column.minWidth, Math.round(value)),
  );
}

export function trackCollectionColumnWidth(kind, role, preferences = {}) {
  const profile = trackCollectionProfile(kind);
  const column = COLUMN_DEFINITIONS[role];
  if (!column) return null;
  const defaultWidth = profile.columnWidths[role] ?? column.defaultWidth;
  const minWidth =
    role === 'identity' && profile.columnWidths.minIdentityWidth
      ? profile.columnWidths.minIdentityWidth
      : column.minWidth;
  const resolvedColumn = { ...column, minWidth };
  const width = allowedResizableRoles(profile).includes(role)
    ? boundedColumnWidth(
        preferences.widths?.[role],
        resolvedColumn,
        defaultWidth,
      )
    : defaultWidth;
  return Object.freeze({
    defaultWidth,
    minWidth,
    maxWidth: column.maxWidth,
    width,
    resizable: column.resizable,
  });
}

export function normalizeTrackCollectionPreferences(kind, value = {}) {
  const profile = trackCollectionProfile(kind);
  const requestedAdvanced = new Set(
    Array.isArray(value?.visibleAdvanced) ? value.visibleAdvanced : [],
  );
  const visibleAdvanced = profile.advancedColumns
    .map((column) => column.role)
    .filter((role) => requestedAdvanced.has(role));
  const requestedHiddenDefaults = new Set(
    Array.isArray(value?.hiddenDefaultColumns)
      ? value.hiddenDefaultColumns
      : [],
  );
  const hiddenDefaultColumns = profile.toggleableDefaultColumns.filter((role) =>
    requestedHiddenDefaults.has(role),
  );
  const widths = {};
  for (const role of allowedResizableRoles(profile)) {
    const candidate = value?.widths?.[role];
    if (!Number.isFinite(candidate)) continue;
    const width = trackCollectionColumnWidth(kind, role, {
      widths: { [role]: candidate },
    });
    widths[role] = width.width;
  }
  const columnOrder = profile.canReorderColumns
    ? normalizedSemanticOrder(profile, value?.columnOrder)
    : null;
  return Object.freeze({
    visibleAdvanced: Object.freeze(visibleAdvanced),
    hiddenDefaultColumns: Object.freeze(hiddenDefaultColumns),
    widths: Object.freeze(widths),
    ...(columnOrder ? { columnOrder: Object.freeze(columnOrder) } : {}),
  });
}

export function normalizeTrackCollectionSort(kind, value = {}) {
  const profile = trackCollectionProfile(kind);
  if (
    !profile.canSortTrackRows ||
    !TRACK_COLLECTION_SORT_KEYS.has(value?.key)
  ) {
    return DEFAULT_TRACK_COLLECTION_SORT;
  }
  return Object.freeze({
    key: value.key,
    direction: value.direction === 'desc' ? 'desc' : 'asc',
  });
}

export function trackCollectionColumns(kind, preferences = {}) {
  const profile = trackCollectionProfile(kind);
  const normalized = normalizeTrackCollectionPreferences(kind, preferences);
  const hiddenDefaultRoles = new Set(normalized.hiddenDefaultColumns);
  const visibleAdvancedRoles = new Set(normalized.visibleAdvanced);
  const semanticOrder = normalized.columnOrder ?? defaultSemanticOrder(profile);
  const visibleSemanticColumns = [
    ...profile.semanticColumns.filter(
      (column) => !hiddenDefaultRoles.has(column.role),
    ),
    ...profile.advancedColumns.filter((column) =>
      visibleAdvancedRoles.has(column.role),
    ),
  ].sort(
    (left, right) =>
      semanticOrder.indexOf(left.role) - semanticOrder.indexOf(right.role),
  );
  return Object.freeze([
    COLUMN_DEFINITIONS.ordinal,
    COLUMN_DEFINITIONS.identity,
    ...visibleSemanticColumns,
    COLUMN_DEFINITIONS.duration,
    COLUMN_DEFINITIONS.actions,
  ]);
}

export function reorderTrackCollectionColumn(
  kind,
  preferences,
  movedRole,
  targetRole,
  position = 'before',
) {
  const profile = trackCollectionProfile(kind);
  const normalized = normalizeTrackCollectionPreferences(kind, preferences);
  if (!profile.canReorderColumns || movedRole === targetRole) return normalized;

  const order = [...(normalized.columnOrder ?? defaultSemanticOrder(profile))];
  if (!order.includes(movedRole) || !order.includes(targetRole)) {
    return normalized;
  }
  order.splice(order.indexOf(movedRole), 1);
  const targetIndex = order.indexOf(targetRole);
  order.splice(targetIndex + (position === 'after' ? 1 : 0), 0, movedRole);
  return normalizeTrackCollectionPreferences(kind, {
    visibleAdvanced: normalized.visibleAdvanced,
    hiddenDefaultColumns: normalized.hiddenDefaultColumns,
    widths: normalized.widths,
    columnOrder: order,
  });
}

export function trackCollectionColumnRoles(kind, preferences = {}) {
  return trackCollectionColumns(kind, preferences).map((column) => column.role);
}

function compactDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}/${month}/${day}`;
}

export function projectTrackCollectionEntries(entries, kind) {
  const profile = trackCollectionProfile(kind);
  return entries.map((entry) => {
    const playCount = optionalNonNegativeInteger(entry.playCount);
    return {
      ...entry,
      ordinalText:
        profile.ordinalMode === 'source'
          ? sourceOrdinal(entry)
          : collectionOrdinal(entry),
      releaseText: String(entry.albumTitle ?? entry.track?.album ?? ''),
      releaseYearText: canonicalReleaseYear(
        entry.releaseYear ?? entry.track?.releaseYear,
      ),
      membershipText: String(entry.addedAtLabel ?? compactDate(entry.addedAt)),
      importedText: compactDate(entry.importedAt ?? entry.track?.importedAt),
      usageText: playCount === null ? '—' : formatGroupedInteger(playCount),
      playCount,
    };
  });
}
