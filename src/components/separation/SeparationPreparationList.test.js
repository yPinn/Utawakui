import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationPreparationList.vue', import.meta.url),
  'utf8',
);

describe('SeparationPreparationList', () => {
  it('projects source tracks into concise unprepared and prepared sections', () => {
    expect(source).toContain('heading="尚未準備"');
    expect(source).toContain('heading="已有伴奏"');
    expect(source.match(/<TrackIdentityRow\b/gu)).toHaveLength(2);
    expect(source.match(/navigation="artist"/gu)).toHaveLength(2);
    expect(source).toContain(':icon="BadgeCheck"');
    expect(source).toContain('label="已有伴奏"');
    expect(source).not.toContain('index + 1');
  });

  it('owns one explicit section-level restart action', () => {
    expect(source).toContain(':icon="RotateCcw"');
    expect(source).toContain('label="重新準備已有伴奏"');
    expect(source).toContain("emit('restartPrepared')");
    expect(source).toContain(':disabled="busy"');
  });

  it('forwards artist navigation and reuses Right Dock row density', () => {
    expect(source.match(/class="right-dock-track"/gu)).toHaveLength(2);
    expect(
      source.match(/@navigate="emit\('navigate', \$event\)"/gu),
    ).toHaveLength(2);
    expect(source).not.toContain('<UiTrackRow');
  });
});
