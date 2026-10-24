import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiNotice from './UiNotice.vue';
import UiButton from './UiButton.vue';
import { provideNoticeReporter } from './noticeReporter.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

attachClientRender(UiNotice, './UiNotice.vue', import.meta.url);
attachClientRender(UiButton, './UiButton.vue', import.meta.url);

const errorRecord = {
  id: 'library-1',
  severity: 'error',
  source: 'library',
  title: '曲庫讀取失敗',
  message: '目前無法讀取曲庫。',
  actionLabel: '重試',
};

function render(notice, reporter) {
  const onAction = vi.fn();
  const Host = {
    setup() {
      if (reporter) provideNoticeReporter(reporter);
      return () => h(UiNotice, { notice, onAction });
    },
  };
  const { root } = mount(Host);
  const buttons = findAll(root, (node) => node.type === 'button');
  return { buttons, onAction, labels: buttons.map(textContent) };
}

const reporterFor = () => ({
  label: '回報這個問題',
  canReport: (notice) => notice.severity === 'error',
  report: vi.fn(),
});

describe('UiNotice reporter', () => {
  it('offers the provided report action next to the recovery action', () => {
    const reporter = reporterFor();
    const { buttons, labels, onAction } = render(errorRecord, reporter);

    expect(labels.map((label) => label.trim())).toEqual([
      '重試',
      '回報這個問題',
    ]);
    trigger(buttons[1], 'onClick');
    expect(reporter.report).toHaveBeenCalledWith(errorRecord);
    trigger(buttons[0], 'onClick');
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('stays a plain notice without a reporter or for non-error notices', () => {
    expect(render(errorRecord, null).labels.map((l) => l.trim())).toEqual([
      '重試',
    ]);
    expect(
      render({ ...errorRecord, severity: 'warning' }, reporterFor()).labels.map(
        (label) => label.trim(),
      ),
    ).toEqual(['重試']);
  });
});
