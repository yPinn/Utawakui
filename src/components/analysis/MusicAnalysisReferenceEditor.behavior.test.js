import { describe, expect, it, vi } from 'vitest';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import MusicAnalysisReferenceEditor from './MusicAnalysisReferenceEditor.vue';

for (const [component, filename] of [
  [UiButton, '../ui/UiButton.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [MusicAnalysisReferenceEditor, './MusicAnalysisReferenceEditor.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function props(overrides = {}) {
  return {
    annotationCase: {
      id: 'case-01',
      durationMs: 120000,
      referenceBpm: 128,
      referenceSections: [
        { startMs: 0, endMs: 30000, role: 'intro' },
        { startMs: 30000, endMs: 120000, role: 'verse' },
      ],
      complete: false,
    },
    allowedRoles: [
      'intro',
      'verse',
      'pre-chorus',
      'chorus',
      'bridge',
      'instrumental',
      'outro',
    ],
    currentTimeMs: 30100,
    isCurrentTrack: true,
    beats: [{ timeMs: 30200, downbeat: true }],
    snapToDownbeats: true,
    ...overrides,
  };
}

describe('MusicAnalysisReferenceEditor quick annotation', () => {
  it('maps keyboard actions to snapped boundaries, roles, save, and navigation', () => {
    const addBoundary = vi.fn();
    const addBoundaryWithRole = vi.fn();
    const updateRole = vi.fn();
    const save = vi.fn();
    const nextIncomplete = vi.fn();
    const { app, root } = mount(
      MusicAnalysisReferenceEditor,
      props({
        onAddBoundary: addBoundary,
        onAddBoundaryWithRole: addBoundaryWithRole,
        onUpdateRole: updateRole,
        onSave: save,
        onNextIncomplete: nextIncomplete,
      }),
    );
    const editor = findAll(root, (node) =>
      String(node.props.class || '').includes('reference-editor'),
    )[0];
    const keyboardEvent = (key, overrides = {}) => ({
      key,
      target: { tagName: 'DIV', isContentEditable: false },
      preventDefault: vi.fn(),
      ...overrides,
    });

    trigger(editor, 'onKeydown', keyboardEvent('b'));
    trigger(editor, 'onKeydown', keyboardEvent('4'));
    trigger(editor, 'onKeydown', keyboardEvent('4', { shiftKey: true }));
    trigger(editor, 'onKeydown', keyboardEvent('s', { ctrlKey: true }));
    trigger(editor, 'onKeydown', keyboardEvent('n'));

    expect(addBoundary).toHaveBeenCalledWith(30200);
    expect(updateRole).toHaveBeenCalledWith(1, 'chorus');
    expect(addBoundaryWithRole).toHaveBeenCalledWith(30200, 'chorus');
    expect(save).toHaveBeenCalledOnce();
    expect(nextIncomplete).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('does not steal shortcuts from text fields and nudges only a real boundary', () => {
    const addBoundary = vi.fn();
    const moveBoundary = vi.fn();
    const { app, root } = mount(
      MusicAnalysisReferenceEditor,
      props({ onAddBoundary: addBoundary, onMoveBoundary: moveBoundary }),
    );
    const editor = findAll(root, (node) =>
      String(node.props.class || '').includes('reference-editor'),
    )[0];

    trigger(editor, 'onKeydown', {
      key: 'b',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault: vi.fn(),
    });
    trigger(editor, 'onKeydown', {
      key: 'ArrowRight',
      altKey: true,
      target: { tagName: 'DIV', isContentEditable: false },
      preventDefault: vi.fn(),
    });

    expect(addBoundary).not.toHaveBeenCalled();
    expect(moveBoundary).toHaveBeenCalledWith(1, 30100);
    app.unmount();
  });
});
