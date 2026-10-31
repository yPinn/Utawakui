import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const source = (name) =>
  readCatalogSource(new URL(`./${name}.vue`, import.meta.url));
describe('Settings modal workspace composition', () => {
  it.each([
    'FfmpegSourceModal',
    'FeedbackReportModal',
    'ObsSessionExportModal',
    'VirtualCableGuideModal',
  ])('%s uses compact shared bounds and the existing header tools', (name) => {
    const text = source(name);
    expect(text).toContain('size="notice"');
    expect(text).toContain('max-block-size="small"');
    expect(text).toMatch(/#header-actions/u);
  });
  it('keeps complete device names in a wide single-scroll workspace and moves help to the header', () => {
    const text = source('CaptureDeviceModal');
    expect(text).toContain('size="wide"');
    expect(text).toContain('body-mode="workspace"');
    expect(text).toContain('#header-actions');
    expect(text).toContain('選擇後立即套用');
    expect(text.match(/<UiScrollLayout\b/gu)).toHaveLength(1);
  });
});
