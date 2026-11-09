const COVER_CREDIT =
  /^(?<name>.+?)\s+[/／|｜]\s*covered\s+by\s+(?<credit>.+)$/iu;
const COVER_SUFFIX =
  /^(?<name>.+?)\s*(?:\(\s*(?:cover|翻唱)\s*\)|（\s*(?:cover|翻唱)\s*）|\s[-–—]\s+(?:cover|翻唱))$/iu;
const versionWord = 'acoustic|live|remix|demo|instrumental';
const versionEnd = String.raw`(?:\s+ver(?:sion)?\.?)?`;
const separatedVersion = new RegExp(
  String.raw`^(?<title>.+?)\s+[-–—]\s+(?<version>${versionWord})${versionEnd}(?:\s+[-–—])?$`,
  'iu',
);
const bracketedVersion = new RegExp(
  String.raw`^(?<title>.+?)\s*[(（]\s*(?<version>${versionWord})${versionEnd}\s*[)）]$`,
  'iu',
);
const namedVersion = new RegExp(
  String.raw`^(?<title>.+?)\s+(?<version>${versionWord})\s+ver(?:sion)?\.?$`,
  'iu',
);

export function readTrackTitleHints(value) {
  const source = (value ?? '').trim();
  const credit = COVER_CREDIT.exec(source)?.groups;
  const markedCover = credit ?? COVER_SUFFIX.exec(source)?.groups;
  const name = markedCover?.name ?? source;
  const variant =
    separatedVersion.exec(name)?.groups ??
    bracketedVersion.exec(name)?.groups ??
    namedVersion.exec(name)?.groups;
  return {
    title: variant?.title.trim() ?? name,
    creditedTitle: credit && variant ? name.replace(/\s+[-–—]$/u, '') : name,
    version: variant?.version.toLowerCase() ?? '',
    cover: Boolean(markedCover),
    credit: credit?.credit ?? '',
  };
}
