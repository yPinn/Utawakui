import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import QueueTrackButton from './QueueTrackButton.vue';
import { attachClientRender, mount } from '../ui/uiTestHost.js';

const fixture = vi.hoisted(() => ({ row: null }));
vi.mock('../ui/UiTrackRow.vue', () => ({
  default: {
    props: ['activateOnEnter', 'artworkClickable'],
    setup(props, { emit }) {
      fixture.row = { props, emit };
      return () => h('li');
    },
  },
}));
attachClientRender(QueueTrackButton, './QueueTrackButton.vue', import.meta.url);
describe('Queue track playback is an explicit feature capability', () => {
  it('blocks every activation path while preserving selection for a read-only artwork recipe', () => {
    const onActivate = vi.fn(),
      onTogglePlayback = vi.fn(),
      onSelect = vi.fn();
    const view = mount(QueueTrackButton, {
      track: { id: 'one', title: 'One' },
      playbackActions: false,
      onActivate,
      onTogglePlayback,
      onSelect,
    });
    expect(fixture.row.props.activateOnEnter).toBe(false);
    expect(fixture.row.props.artworkClickable).toBe(false);
    fixture.row.emit('row-dblclick');
    fixture.row.emit('activate');
    fixture.row.emit('artwork-click');
    fixture.row.emit('row-click');
    expect(onActivate).not.toHaveBeenCalled();
    expect(onTogglePlayback).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledOnce();
    view.app.unmount();
  });
  it('preserves normal Queue playback by default', () => {
    const onActivate = vi.fn(),
      onTogglePlayback = vi.fn();
    const view = mount(QueueTrackButton, {
      track: { id: 'one', title: 'One' },
      onActivate,
      onTogglePlayback,
    });
    expect(fixture.row.props.activateOnEnter).toBe(true);
    expect(fixture.row.props.artworkClickable).toBe(true);
    fixture.row.emit('row-dblclick');
    fixture.row.emit('activate');
    fixture.row.emit('artwork-click');
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onTogglePlayback).toHaveBeenCalledOnce();
    view.app.unmount();
  });
});
