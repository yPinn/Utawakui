import contractValues from '../../shared/musicStructureContractValues.json';

export const REFERENCE_ROLE_LABELS = Object.freeze({
  intro: '前奏',
  verse: '主歌',
  'pre-chorus': '預副歌',
  chorus: '副歌',
  bridge: '橋段',
  instrumental: '間奏',
  outro: '尾奏',
});

const ALLOWED_ROLES = new Set(Object.keys(REFERENCE_ROLE_LABELS));

function cloneSections(sections) {
  return sections.map((section) => ({ ...section }));
}

function hasFullCoverage(sections, durationMs) {
  return (
    sections.length > 0 &&
    sections[0].startMs === 0 &&
    sections.at(-1).endMs === durationMs &&
    sections.every(
      (section, index) =>
        Number.isSafeInteger(section.startMs) &&
        Number.isSafeInteger(section.endMs) &&
        section.endMs > section.startMs &&
        (index === 0 || section.startMs === sections[index - 1].endMs),
    )
  );
}

export function splitReferenceSection(sections, boundaryMs, durationMs) {
  if (
    !Number.isSafeInteger(boundaryMs) ||
    boundaryMs <= 0 ||
    boundaryMs >= durationMs
  ) {
    return cloneSections(sections);
  }
  const index = sections.findIndex(
    (section) => section.startMs < boundaryMs && boundaryMs < section.endMs,
  );
  if (index < 0) return cloneSections(sections);
  const current = sections[index];
  return [
    ...cloneSections(sections.slice(0, index)),
    { startMs: current.startMs, endMs: boundaryMs, role: current.role },
    { startMs: boundaryMs, endMs: current.endMs, role: current.role },
    ...cloneSections(sections.slice(index + 1)),
  ];
}

export function splitReferenceSectionWithRole(
  sections,
  boundaryMs,
  durationMs,
  role,
) {
  if (!ALLOWED_ROLES.has(role)) return cloneSections(sections);
  const next = splitReferenceSection(sections, boundaryMs, durationMs);
  const index = next.findIndex((section) => section.startMs === boundaryMs);
  return index < 0 ? next : updateReferenceSectionRole(next, index, role);
}

export function activeReferenceSectionIndex(sections, timeMs, durationMs) {
  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    !Number.isFinite(timeMs) ||
    timeMs < 0 ||
    !Number.isFinite(durationMs) ||
    timeMs > durationMs
  ) {
    return -1;
  }
  if (timeMs === durationMs) return sections.length - 1;
  return sections.findIndex(
    (section) => section.startMs <= timeMs && timeMs < section.endMs,
  );
}

export function snapReferenceBoundary(boundaryMs, beats, toleranceMs = 300) {
  if (
    !Number.isSafeInteger(boundaryMs) ||
    !Array.isArray(beats) ||
    !Number.isFinite(toleranceMs) ||
    toleranceMs < 0
  ) {
    return boundaryMs;
  }
  const candidates = beats
    .filter(
      (beat) =>
        beat?.downbeat === true &&
        Number.isSafeInteger(beat.timeMs) &&
        Math.abs(beat.timeMs - boundaryMs) <= toleranceMs,
    )
    .sort(
      (left, right) =>
        Math.abs(left.timeMs - boundaryMs) -
          Math.abs(right.timeMs - boundaryMs) || left.timeMs - right.timeMs,
    );
  return candidates[0]?.timeMs ?? boundaryMs;
}

export function moveReferenceBoundary(
  sections,
  index,
  boundaryMs,
  durationMs,
  minimumSectionMs = 100,
) {
  if (
    !Number.isSafeInteger(index) ||
    index <= 0 ||
    index >= sections.length ||
    !Number.isSafeInteger(boundaryMs) ||
    !Number.isSafeInteger(minimumSectionMs) ||
    minimumSectionMs < 1
  ) {
    return cloneSections(sections);
  }
  const previous = sections[index - 1];
  const current = sections[index];
  if (
    boundaryMs < previous.startMs + minimumSectionMs ||
    boundaryMs > current.endMs - minimumSectionMs
  ) {
    return cloneSections(sections);
  }
  const next = cloneSections(sections);
  next[index - 1].endMs = boundaryMs;
  next[index].startMs = boundaryMs;
  return hasFullCoverage(next, durationMs) ? next : cloneSections(sections);
}

export function blindReferenceBeatGrid(structure, trackId) {
  if (
    !structure ||
    structure.trackId !== trackId ||
    structure.signals?.level !== 'M1' ||
    !Array.isArray(structure.signals.beats)
  ) {
    return [];
  }
  return structure.signals.beats;
}

export function updateReferenceSectionRole(sections, index, role) {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= sections.length ||
    (role !== null && !ALLOWED_ROLES.has(role))
  ) {
    return cloneSections(sections);
  }
  return sections.map((section, sectionIndex) =>
    sectionIndex === index ? { ...section, role } : { ...section },
  );
}

export function mergeReferenceBoundary(sections, index, durationMs) {
  if (!Number.isSafeInteger(index) || index <= 0 || index >= sections.length) {
    return cloneSections(sections);
  }
  const previous = sections[index - 1];
  const current = sections[index];
  const merged = {
    startMs: previous.startMs,
    endMs: current.endMs,
    role: previous.role === current.role ? previous.role : null,
  };
  const next = [
    ...cloneSections(sections.slice(0, index - 1)),
    merged,
    ...cloneSections(sections.slice(index + 1)),
  ];
  return hasFullCoverage(next, durationMs) ? next : cloneSections(sections);
}

export function isReferenceCaseComplete(referenceCase) {
  return (
    Number.isFinite(referenceCase?.referenceBpm) &&
    referenceCase.referenceBpm >= contractValues.minBpm &&
    referenceCase.referenceBpm <= contractValues.maxBpm &&
    Array.isArray(referenceCase.referenceSections) &&
    referenceCase.referenceSections.length >= 2 &&
    hasFullCoverage(
      referenceCase.referenceSections,
      referenceCase.durationMs,
    ) &&
    referenceCase.referenceSections.every((section) =>
      ALLOWED_ROLES.has(section.role),
    )
  );
}

export function formatReferenceTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function referenceRoleLabel(role) {
  return role === null ? '未標註' : (REFERENCE_ROLE_LABELS[role] ?? role);
}
