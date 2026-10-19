import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import Group from './LyricsProviderRecordingGroup.vue';
import Row from './LyricsLrclibCandidateRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiStack from '../ui/UiStack.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, path] of [
  [Group, './LyricsProviderRecordingGroup.vue'],
  [Row, './LyricsLrclibCandidateRow.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiSurface, '../ui/UiSurface.vue'],
])
  attachClientRender(component, path, import.meta.url);
attachClientRender(
  UiTooltipSurface,
  '../ui/tooltip/UiTooltipSurface.vue',
  import.meta.url,
);
let app;
afterEach(() => {
  app?.unmount();
});

function setup(offsetMs = 2000) {
  const candidate = (providerId) => ({
    id: 1,
    candidateKey: `${providerId}:1`,
    providerId,
    trackName: 'Test song',
    artistName: 'Test artist',
    capability: { level: 'T1' },
    compatibility: { t1: true },
    warnings: [],
    previewFingerprint: 'a'.repeat(64),
    previewLines: [{ text: 'Preview words', start: 10 }],
    saveState: 'unsaved',
  });
  const onSave = vi.fn();
  const onToggle = vi.fn();
  const props = reactive({
    group: {
      recommendedCandidateKey: 'lrclib:1',
      candidates: [candidate('lrclib'), candidate('netease')],
      timelineDifferences: [
        {
          referenceCandidateKey: 'lrclib:1',
          candidateKey: 'netease:1',
          referenceFingerprint: 'a'.repeat(64),
          candidateFingerprint: 'a'.repeat(64),
          offsetMs,
          matchedLineCount: 8,
        },
      ],
    },
    expandedKey: null,
    changedCandidates: new Map(),
    onSave,
    onToggle,
  });
  const mounted = mount(Group, props);
  app = mounted.app;
  return { ...mounted, props, onSave, onToggle };
}

describe('timeline information within the existing candidate flow', () => {
  it('reports the currently previewed candidate without saving or adopting an update', async () => {
    const { root, props, onSave, onToggle } = setup();
    const onReport = vi.fn();
    props.onReport = onReport;
    props.expandedKey = 'netease:1';
    props.changedCandidates.set('netease:1', {
      ...props.group.candidates[1],
      trackName: 'Updated preview',
    });
    await nextTick();
    const report = findAll(
      root,
      (n) => n.type === 'button' && textContent(n).trim() === '回報歌詞問題',
    )[0];
    expect(report).toBeDefined();
    trigger(report, 'onClick');
    expect(onReport).toHaveBeenCalledWith(
      props.changedCandidates.get('netease:1'),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
    expect(props.changedCandidates.size).toBe(1);
    expect(textContent(root)).toContain('來源內容已更新');
  });
  it('adds a neutral badge and expands the comparison without selecting or saving', async () => {
    const { root, props, onSave, onToggle } = setup();
    expect(textContent(root)).toContain('時間有差異');
    expect(textContent(root)).not.toContain('晚約');
    const expand = findAll(
      root,
      (n) =>
        n.type === 'button' &&
        n.props['aria-label']?.includes('來源時間有差異'),
    )[0];
    expect(expand).toBeDefined();
    trigger(expand, 'onClick');
    expect(onToggle).toHaveBeenCalledWith(props.group.candidates[1]);
    expect(onSave).not.toHaveBeenCalled();
    props.expandedKey = 'netease:1';
    await nextTick();
    expect(textContent(root)).toContain('比 LRCLIB 的來源時間晚約 2 秒');
    expect(textContent(root)).toContain('比對 8 行');
    expect(textContent(root)).toContain('不代表哪份較準');
    expect(onSave).not.toHaveBeenCalled();
    const save = findAll(
      root,
      (n) => n.type === 'button' && textContent(n).trim() === '儲存',
    )[0];
    expect(save).toBeDefined();
    trigger(save, 'onClick');
    expect(onSave).toHaveBeenCalledWith(props.group.candidates[1]);
  });

  it('describes the opposite sign and hides notices when either source changes', async () => {
    const { root, props } = setup(-2400);
    props.expandedKey = 'netease:1';
    await nextTick();
    expect(textContent(root)).toContain('早約 2.4 秒');
    props.changedCandidates.set('lrclib:1', {
      ...props.group.candidates[0],
      previewFingerprint: 'b'.repeat(64),
    });
    await nextTick();
    expect(textContent(root)).not.toContain('時間有差異');
    props.changedCandidates.clear();
    await nextTick();
    expect(textContent(root)).toContain('時間有差異');
    props.group.candidates[1].previewFingerprint = 'c'.repeat(64);
    await nextTick();
    expect(textContent(root)).not.toContain('時間有差異');
  });

  it('rejects stale group references, malformed differences and result replacement', async () => {
    const { root, props, onSave } = setup();
    props.group.timelineDifferences[0].referenceCandidateKey = 'missing:1';
    await nextTick();
    expect(textContent(root)).not.toContain('時間有差異');
    props.group.timelineDifferences[0].referenceCandidateKey = 'lrclib:1';
    props.group.timelineDifferences[0].offsetMs = Number.NaN;
    await nextTick();
    expect(textContent(root)).not.toContain('時間有差異');
    props.group = { ...props.group, timelineDifferences: [] };
    await nextTick();
    expect(textContent(root)).not.toContain('時間有差異');
    expect(onSave).not.toHaveBeenCalled();
  });
});
