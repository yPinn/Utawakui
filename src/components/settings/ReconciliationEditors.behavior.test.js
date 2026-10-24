import { h, nextTick, shallowRef } from 'vue';
import { expect, it } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiField from '../ui/UiField.vue';
import UiHint from '../ui/UiHint.vue';
import ReconciliationMetadataFields from './ReconciliationMetadataFields.vue';
import ReconciliationMergePreview from './ReconciliationMergePreview.vue';
for (const [component, file] of [
  [UiSelect, '../ui/UiSelect.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [ReconciliationMetadataFields, './ReconciliationMetadataFields.vue'],
  [ReconciliationMergePreview, './ReconciliationMergePreview.vue'],
])
  attachClientRender(component, file, import.meta.url);
const control = (view, suffix, type = 'select') =>
  findAll(view.root, (n) => n.type === type && n.props.id?.endsWith(suffix))[0];
const choose = async (view, suffix, value) => {
  trigger(control(view, suffix), 'onChange', { target: { value } });
  await nextTick();
};
it('retains snapshot/follow/manual/clear decisions and only shows a result for selected changes', async () => {
  const preview = {
    fields: {
      title: {
        value: 'Library',
        origin: 'manual',
        observed: 'Provider',
        observedKind: 'provider',
        canFollow: true,
      },
      album: {
        value: 'Album',
        observed: 'File album',
        observedKind: 'tags',
        canFollow: false,
      },
      releaseYear: { value: 2025, observed: 2026, observedKind: 'provider' },
    },
    fileTags: { title: 'File title' },
    providerValues: { title: 'Provider' },
  };
  const before = JSON.stringify(preview),
    decisions = shallowRef({});
  const view = mount({
    setup: () => () =>
      h(ReconciliationMetadataFields, {
        preview,
        decisions: decisions.value,
        'onUpdate:decisions': (v) => (decisions.value = v),
      }),
  });
  try {
    expect(textContent(view.root)).not.toContain('儲存後：');
    const titleOptions = findAll(
      control(view, 'title-action'),
      (n) => n.type === 'option',
    ).map((n) => n.props.value);
    expect(titleOptions).toEqual(['keep', 'source', 'follow', 'manual']);
    expect(
      findAll(control(view, 'album-action'), (n) => n.type === 'option').map(
        (n) => n.props.value,
      ),
    ).toEqual(['keep', 'source', 'manual', 'clear']);
    await choose(view, 'title-action', 'source');
    expect(decisions.value.title).toEqual({ action: 'source' });
    expect(textContent(view.root)).toContain('儲存後：Provider');
    await choose(view, 'title-action', 'follow');
    expect(decisions.value.title).toEqual({ action: 'follow' });
    await choose(view, 'releaseYear-action', 'manual');
    trigger(control(view, 'releaseYear-value', 'input'), 'onInput', {
      target: { value: '2027' },
    });
    await nextTick();
    expect(decisions.value.releaseYear).toEqual({
      action: 'manual',
      value: 2027,
    });
    await choose(view, 'album-action', 'clear');
    expect(decisions.value.album).toEqual({ action: 'clear' });
    expect(textContent(view.root)).toContain('儲存後：空白');
    await choose(view, 'title-action', 'keep');
    expect(decisions.value.title).toEqual({ action: 'keep' });
    expect(JSON.stringify(preview)).toBe(before);
  } finally {
    view.app.unmount();
  }
});
it('keeps merge choices and date precision while resetting suggested choices to the original intent', async () => {
  const day = { value: '2026-07-25', precision: 'day' };
  const preview = {
    kept: { name: 'Local' },
    retired: { name: 'Source' },
    mergeable: true,
    reason: 'verified-release-members',
    tracks: ['a'],
    fields: [
      {
        field: 'date',
        kept: day,
        other: { value: '2026', precision: 'year' },
        proposed: day,
      },
    ],
  };
  const before = JSON.stringify(preview),
    choices = shallowRef({});
  const view = mount({
    setup: () => () =>
      h(ReconciliationMergePreview, {
        preview,
        choices: choices.value,
        'onUpdate:choices': (v) => (choices.value = v),
      }),
  });
  try {
    expect(textContent(view.root)).toContain('合併後：2026-07-25');
    await choose(view, '-date', 'other');
    expect(choices.value).toEqual({ date: 'other' });
    await choose(view, '-date', 'keep');
    expect(choices.value).toEqual({ date: 'keep' });
    await choose(view, '-date', 'suggested');
    expect(choices.value).toEqual({});
    expect(textContent(view.root)).toContain('可復原');
    expect(textContent(view.root)).toContain('音檔不變');
    expect(JSON.stringify(preview)).toBe(before);
  } finally {
    view.app.unmount();
  }
});
it('retains the blocked merge reason and disables field choices', () => {
  const view = mount(ReconciliationMergePreview, {
    preview: {
      kept: { name: 'Single' },
      retired: { name: 'EP' },
      mergeable: false,
      reason: 'different-tracklist',
      tracks: [],
      fields: [
        { field: 'name', kept: 'Single', other: 'EP', proposed: 'Single' },
      ],
    },
  });
  try {
    expect(textContent(view.root)).toContain('發行類型或完整曲序不同');
    expect(control(view, '-name').props.disabled).toBe(true);
  } finally {
    view.app.unmount();
  }
});
