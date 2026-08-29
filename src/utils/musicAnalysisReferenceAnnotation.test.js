import { describe, expect, it } from 'vitest';
import {
  activeReferenceSectionIndex,
  blindReferenceBeatGrid,
  isReferenceCaseComplete,
  mergeReferenceBoundary,
  moveReferenceBoundary,
  snapReferenceBoundary,
  splitReferenceSection,
  splitReferenceSectionWithRole,
  updateReferenceSectionRole,
} from './musicAnalysisReferenceAnnotation.js';

const blankSections = [{ startMs: 0, endMs: 120000, role: null }];

describe('music analysis reference annotation edits', () => {
  it('splits at the playback time without inventing a role', () => {
    expect(splitReferenceSection(blankSections, 30000, 120000)).toEqual([
      { startMs: 0, endMs: 30000, role: null },
      { startMs: 30000, endMs: 120000, role: null },
    ]);
  });

  it('preserves an authored role when refining an existing interval', () => {
    const sections = [{ startMs: 0, endMs: 120000, role: 'verse' }];
    expect(splitReferenceSection(sections, 60000, 120000)).toEqual([
      { startMs: 0, endMs: 60000, role: 'verse' },
      { startMs: 60000, endMs: 120000, role: 'verse' },
    ]);
  });

  it('updates roles and merges a boundary without leaving a gap', () => {
    const split = splitReferenceSection(blankSections, 30000, 120000);
    const intro = updateReferenceSectionRole(split, 0, 'intro');
    const chorus = updateReferenceSectionRole(intro, 1, 'chorus');

    expect(mergeReferenceBoundary(chorus, 1, 120000)).toEqual([
      { startMs: 0, endMs: 120000, role: null },
    ]);
  });

  it('requires BPM, multiple covered intervals, and canonical roles', () => {
    expect(
      isReferenceCaseComplete({
        durationMs: 120000,
        referenceBpm: 128,
        referenceSections: [
          { startMs: 0, endMs: 30000, role: 'intro' },
          { startMs: 30000, endMs: 120000, role: 'chorus' },
        ],
      }),
    ).toBe(true);
    expect(
      isReferenceCaseComplete({
        durationMs: 120000,
        referenceBpm: null,
        referenceSections: blankSections,
      }),
    ).toBe(false);
  });

  it('tracks the authored interval under the playhead including the song end', () => {
    const sections = [
      { startMs: 0, endMs: 30000, role: 'intro' },
      { startMs: 30000, endMs: 120000, role: 'verse' },
    ];

    expect(activeReferenceSectionIndex(sections, 29999, 120000)).toBe(0);
    expect(activeReferenceSectionIndex(sections, 30000, 120000)).toBe(1);
    expect(activeReferenceSectionIndex(sections, 120000, 120000)).toBe(1);
    expect(activeReferenceSectionIndex(sections, -1, 120000)).toBe(-1);
  });

  it('snaps only to a nearby M1 downbeat with deterministic ties', () => {
    const beats = [
      { timeMs: 29800, downbeat: true },
      { timeMs: 30000, downbeat: false },
      { timeMs: 30200, downbeat: true },
    ];

    expect(snapReferenceBoundary(30000, beats, 300)).toBe(29800);
    expect(snapReferenceBoundary(31000, beats, 300)).toBe(31000);
    expect(snapReferenceBoundary(30000, [], 300)).toBe(30000);
  });

  it('moves one shared boundary without gaps or collapsing adjacent sections', () => {
    const sections = [
      { startMs: 0, endMs: 30000, role: 'intro' },
      { startMs: 30000, endMs: 60000, role: 'verse' },
      { startMs: 60000, endMs: 120000, role: 'chorus' },
    ];

    expect(moveReferenceBoundary(sections, 1, 30100, 120000)).toEqual([
      { startMs: 0, endMs: 30100, role: 'intro' },
      { startMs: 30100, endMs: 60000, role: 'verse' },
      { startMs: 60000, endMs: 120000, role: 'chorus' },
    ]);
    expect(moveReferenceBoundary(sections, 1, 50, 120000)).toEqual(sections);
  });

  it('combines a boundary and the next authored role in one edit', () => {
    const sections = [{ startMs: 0, endMs: 120000, role: 'verse' }];

    expect(
      splitReferenceSectionWithRole(sections, 30000, 120000, 'chorus'),
    ).toEqual([
      { startMs: 0, endMs: 30000, role: 'verse' },
      { startMs: 30000, endMs: 120000, role: 'chorus' },
    ]);
  });

  it('exposes beat guidance only from a matching M1 result', () => {
    const beats = [{ timeMs: 30000, downbeat: true }];
    expect(
      blindReferenceBeatGrid(
        { trackId: 'track-01', signals: { level: 'M1', beats } },
        'track-01',
      ),
    ).toBe(beats);
    expect(
      blindReferenceBeatGrid(
        {
          trackId: 'track-01',
          signals: { level: 'M2', beats, sections: [] },
        },
        'track-01',
      ),
    ).toEqual([]);
    expect(
      blindReferenceBeatGrid(
        { trackId: 'track-02', signals: { level: 'M1', beats } },
        'track-01',
      ),
    ).toEqual([]);
  });
});
