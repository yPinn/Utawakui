import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workbenchSource = fs.readFileSync(
  new URL('./MusicAnalysisWorkbench.vue', import.meta.url),
  'utf8',
);
const pickerSource = fs.readFileSync(
  new URL('./MusicAnalysisTrackPicker.vue', import.meta.url),
  'utf8',
);

describe('Music Analysis scroll layout', () => {
  it('fills the page and keeps the split pane within the available height', () => {
    expect(workbenchSource).toMatch(
      /\.analysis-workbench\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(workbenchSource).toMatch(
      /\.analysis-workbench__layout\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s,
    );
  });

  it('keeps track search visible while only the track list scrolls', () => {
    expect(pickerSource).toMatch(
      /\.analysis-picker\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(pickerSource).toMatch(
      /\.analysis-picker__list\s*\{[^}]*flex:\s*1;[^}]*overflow-y:\s*auto;/s,
    );
  });

  it('gives the result pane its own vertical scroll boundary', () => {
    expect(workbenchSource).toMatch(
      /\.analysis-workbench__detail\s*\{[^}]*overflow-y:\s*auto;/s,
    );
  });
});
