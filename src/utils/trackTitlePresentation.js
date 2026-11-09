import { readTrackTitleHints } from '../../shared/trackTitleHints.mjs';

function formatVersion(version) {
  return version ? version[0].toUpperCase() + version.slice(1) : '';
}

export function recordingVersionTags(track) {
  const { version } = readTrackTitleHints(track?.title);
  return track?.workPresentation?.versionTags ?? (version ? [version] : []);
}

function creditKey(value) {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/u)
    .filter((part) => part !== 'ch.' && part !== 'channel')
    .sort()
    .join(' ');
}

export function trackTitlePresentation(track) {
  const sourceTitle = track?.title ?? '';
  const { credit, creditedTitle, title, version } =
    readTrackTitleHints(sourceTitle);
  const artistKey = credit && creditKey(track?.artist);
  const redundantCredit = artistKey && creditKey(credit) === artistKey;
  const projectedTitle = track?.workPresentation?.title;
  const formattedVersion = formatVersion(version);
  // Remove a credit only when the artist line already carries the same names.
  return {
    title: projectedTitle || (redundantCredit ? creditedTitle : sourceTitle),
    queryTitle: redundantCredit
      ? [title, formattedVersion].filter(Boolean).join(' ')
      : sourceTitle,
  };
}

export function trackDisplayTitle(track, tracksById) {
  return trackTitlePresentation(tracksById?.get(track?.id) ?? track).title;
}

function titleKey(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, '');
}

export function trackTitleQueries(track) {
  const { queryTitle } = trackTitlePresentation(track);
  const { version } = readTrackTitleHints(track?.title);
  const names = new Map([[titleKey(queryTitle), queryTitle]]);
  for (const alias of track?.workPresentation?.searchTitles ?? []) {
    const alternate = readTrackTitleHints(alias);
    const title = [alternate.title, version].filter(Boolean).join(' ');
    if (title.length <= 256 && !names.has(titleKey(title)))
      names.set(titleKey(title), title);
  }
  return [...names.values()];
}

export function matchesTrackTitle(track, query) {
  const key = titleKey(query);
  if (!key) return false;
  const { title, version } = readTrackTitleHints(track.title);
  const names = track.workPresentation?.searchTitles ?? [];
  return [
    track.title ?? '',
    title,
    track.workPresentation?.title ?? '',
    ...names,
    ...(version ? names.map((name) => `${name} ${version}`) : []),
  ].some((name) => titleKey(name).includes(key));
}
