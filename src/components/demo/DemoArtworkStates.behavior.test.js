import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import DemoArtworkStates from './DemoArtworkStates.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiField from '../ui/UiField.vue';
import UiHint from '../ui/UiHint.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [DemoArtworkStates, './DemoArtworkStates.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
  [UiArtworkOverlay, '../ui/UiArtworkOverlay.vue'],
  [UiArtworkLoading, '../ui/UiArtworkLoading.vue'],
  [UiArtworkReveal, '../ui/UiArtworkReveal.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);

const one = (root, predicate) => findAll(root, predicate)[0];
const attr = (root, name, value) =>
  one(
    root,
    (n) => name in n.props && (value === undefined || n.props[name] === value),
  );
const click = async (root, name) => {
  trigger(attr(root, name), 'onClick', {});
  await nextTick();
};
const loading = (root) =>
  findAll(root, (n) => n.props.class === 'ui-artwork-loading');

describe('formal artwork lifecycle and reveal compositions', () => {
  it('exposes an accessible loading overlay without an invisible action underneath', () => {
    const { app, root } = mount(DemoArtworkStates);
    const flow = attr(root, 'data-artwork-flow');
    expect(loading(flow)).toHaveLength(1);
    expect(textContent(loading(flow)[0])).toBe('封面資料載入中');
    const host = attr(flow, 'aria-busy');
    expect(host.props['aria-busy']).toBe(true);
    expect(host.props['aria-hidden']).toBeUndefined();
    expect(attr(flow, 'data-artwork-select')).toBeUndefined();
    expect(attr(root, 'data-artwork-retry').props.disabled).toBe(true);
    app.unmount();
  });

  it('completes loading, enables a real selection action and clears selection on reload', async () => {
    const { app, root } = mount(DemoArtworkStates);
    const flow = attr(root, 'data-artwork-flow');
    const host = attr(flow, 'aria-busy');
    await click(root, 'data-artwork-complete');
    expect(loading(flow)).toHaveLength(0);
    expect(host.props['aria-busy']).toBe(false);
    expect(
      one(flow, (n) => n.type === 'img').props['data-track-artwork-kind'],
    ).toBe('custom');
    expect(attr(flow, 'data-artwork-select').props['aria-pressed']).toBe(false);
    await click(root, 'data-artwork-select');
    expect(attr(flow, 'data-artwork-select').props['aria-pressed']).toBe(true);
    expect(textContent(flow)).toContain('已選取封面');
    await click(root, 'data-artwork-retry');
    expect(loading(flow)).toHaveLength(1);
    expect(attr(flow, 'data-artwork-select')).toBeUndefined();
    await click(root, 'data-artwork-complete');
    expect(attr(flow, 'data-artwork-select').props['aria-pressed']).toBe(false);
    app.unmount();
  });

  it('shows an error without a stuck loader, falls back after decode failure and recovers', async () => {
    const { app, root } = mount(DemoArtworkStates);
    const flow = attr(root, 'data-artwork-flow');
    await click(root, 'data-artwork-fail');
    expect(loading(flow)).toHaveLength(0);
    expect(attr(flow, 'aria-busy').props['aria-busy']).toBe(false);
    expect(attr(flow, 'role', 'alert')).toBeTruthy();
    expect(textContent(flow)).toContain('載入失敗');
    const broken = one(flow, (n) => n.type === 'img');
    trigger(broken, 'onError');
    await nextTick();
    expect(
      one(flow, (n) => n.type === 'img').props['data-track-artwork-kind'],
    ).toBe('fallback');
    expect(attr(flow, 'data-artwork-select')).toBeUndefined();
    await click(root, 'data-artwork-retry');
    expect(attr(flow, 'role', 'alert')).toBeUndefined();
    expect(loading(flow)).toHaveLength(1);
    await click(root, 'data-artwork-complete');
    expect(
      one(flow, (n) => n.type === 'img').props['data-track-artwork-kind'],
    ).toBe('custom');
    expect(textContent(attr(flow, 'data-artwork-flow-status'))).not.toContain(
      '載入失敗',
    );
    app.unmount();
  });

  it('keeps self, hover and focus-within scopes distinct with accessible controls', () => {
    const { app, root } = mount(DemoArtworkStates);
    for (const [mode, scope] of [
      ['self', undefined],
      ['hover', ''],
      ['focus-within', 'focus-within'],
    ]) {
      const sample = attr(root, 'data-artwork-reveal-case', mode);
      expect(sample.props['data-artwork-reveal-scope']).toBe(scope);
      expect(
        findAll(sample, (n) => n.props.class?.includes?.('ui-artwork-reveal')),
      ).toHaveLength(1);
      const thumb = one(sample, (n) => n.props.class === 'ui-track-thumb');
      expect(thumb.props['aria-hidden']).toBeUndefined();
      expect(
        attr(sample, 'data-artwork-scope-select').props['aria-pressed'],
      ).toBe(false);
      expect(attr(sample, 'id', `demo-artwork-note-${mode}`)).toBeTruthy();
    }
    app.unmount();
  });

  it('keeps scope selection and text editing independent of lifecycle retries', async () => {
    const { app, root } = mount(DemoArtworkStates);
    const sample = attr(root, 'data-artwork-reveal-case', 'focus-within');
    trigger(attr(sample, 'id', 'demo-artwork-note-focus-within'), 'onInput', {
      target: { value: '日本語の備註' },
    });
    await click(sample, 'data-artwork-scope-select');
    expect(
      attr(sample, 'data-artwork-scope-select').props['aria-pressed'],
    ).toBe(true);
    await click(root, 'data-artwork-fail');
    await click(root, 'data-artwork-retry');
    expect(
      attr(sample, 'id', 'demo-artwork-note-focus-within').props.value,
    ).toBe('日本語の備註');
    expect(
      attr(sample, 'data-artwork-scope-select').props['aria-pressed'],
    ).toBe(true);
    app.unmount();
  });
});
