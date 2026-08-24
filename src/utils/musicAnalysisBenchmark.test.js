import { describe, expect, it } from 'vitest';
import {
  formatBenchmarkTime,
  projectBenchmarkSections,
} from './musicAnalysisBenchmark.js';

describe('music analysis benchmark presentation', () => {
  it('projects proportional sections with localized accessible labels', () => {
    expect(
      projectBenchmarkSections(
        [
          {
            startMs: 0,
            endMs: 30000,
            role: 'intro',
            confidence: 0.8,
          },
          {
            startMs: 30000,
            endMs: 120000,
            role: 'chorus',
            confidence: 0.49,
          },
        ],
        120000,
      ),
    ).toEqual([
      expect.objectContaining({
        key: '0-30000-intro',
        roleLabel: '前奏',
        widthPercent: 25,
        lowConfidence: false,
        ariaLabel: '前奏，0:00 到 0:30，信心 80%',
      }),
      expect.objectContaining({
        key: '30000-120000-chorus',
        roleLabel: '副歌',
        widthPercent: 75,
        lowConfidence: true,
        ariaLabel: '副歌，0:30 到 2:00，信心 49%，低於 M2 門檻',
      }),
    ]);
  });

  it('formats bounded minute and second labels', () => {
    expect(formatBenchmarkTime(0)).toBe('0:00');
    expect(formatBenchmarkTime(225307)).toBe('3:45');
    expect(formatBenchmarkTime(Number.NaN)).toBe('—');
  });
});
