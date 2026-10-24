import { h, nextTick, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import UiField from './UiField.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from './uiTestHost.js';

attachClientRender(UiField, './UiField.vue', import.meta.url);

describe('UiField description and label recovery', () => {
  it('labels grouped controls without associating a label with a non-labelable element', () => {
    const { app, root } = mount(
      UiField,
      {
        id: 'font-size',
        label: '字級',
        group: true,
        hint: '調整閱讀大小',
      },
      { default: () => [h('button', null, '縮小'), h('button', null, '放大')] },
    );
    const group = findAll(root, (node) => node.props.role === 'group')[0];
    expect(group.props['aria-labelledby']).toBe('font-size-label');
    expect(group.props['aria-describedby']).toBe('font-size-hint');
    expect(
      textContent(
        findAll(root, (node) => node.props.id === 'font-size-label')[0],
      ).trim(),
    ).toBe('字級');
    expect(findAll(root, (node) => node.type === 'label')).toHaveLength(0);
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(2);
    app.unmount();
  });
  it('updates slot identity, deduplicates descriptions, and restores hint after error', async () => {
    const props = reactive({
      id: 'title',
      label: '曲目',
      hint: '提示',
      describedBy: 'external external\n title-hint',
      invalid: false,
      error: '',
    });
    const { app, root } = mount(UiField, props, {
      default: ({ controlId, describedBy, invalid }) =>
        h('input', {
          id: controlId,
          'aria-describedby': describedBy,
          'aria-invalid': invalid,
        }),
    });
    const input = () => findAll(root, (node) => node.type === 'input')[0];
    expect(input().props['aria-describedby']).toBe('external title-hint');
    props.error = '必要資訊';
    props.describedBy = 'external title-error external';
    await nextTick();
    expect(input().props['aria-invalid']).toBe(true);
    expect(input().props['aria-describedby']).toBe('external title-error');
    expect(findAll(root, (node) => node.props.role === 'alert')).toHaveLength(
      1,
    );
    expect(textContent(root)).not.toContain('提示');
    props.id = 'renamed';
    props.error = '';
    props.describedBy = 'external';
    await nextTick();
    expect(input().props).toMatchObject({
      id: 'renamed',
      'aria-describedby': 'external renamed-hint',
      'aria-invalid': false,
    });
    expect(findAll(root, (node) => node.type === 'label')[0].props.for).toBe(
      'renamed',
    );
    expect(findAll(root, (node) => node.props.role === 'alert')).toHaveLength(
      0,
    );
    props.invalid = true;
    props.hint = '';
    await nextTick();
    expect(input().props['aria-invalid']).toBe(true);
    props.invalid = false;
    props.describedBy = '';
    await nextTick();
    expect(input().props['aria-describedby']).toBeUndefined();
    expect(input().props['aria-invalid']).toBe(false);
    app.unmount();
  });

  it('keeps one associated label when switching inline and hidden modes', async () => {
    const props = reactive({
      id: 'choice',
      label: '中文 日本語標籤',
      required: true,
      inline: false,
      labelHidden: false,
    });
    const { app, root } = mount(UiField, props, {
      default: ({ controlId }) =>
        h('input', { id: controlId, type: 'checkbox' }),
    });
    const labels = () => findAll(root, (node) => node.type === 'label');
    expect(labels()).toHaveLength(1);
    props.inline = true;
    props.labelHidden = true;
    await nextTick();
    expect(labels()).toHaveLength(1);
    expect(labels()[0].props.for).toBe('choice');
    expect(String(labels()[0].props.class)).toContain(
      'ui-field__label--hidden',
    );
    expect(
      findAll(root, (node) => node.type === 'span')[0].props['aria-hidden'],
    ).toBe('true');
    props.inline = false;
    props.labelHidden = false;
    await nextTick();
    expect(labels()).toHaveLength(1);
    expect(String(labels()[0].props.class)).not.toContain(
      'ui-field__label--hidden',
    );
    app.unmount();
  });
});
