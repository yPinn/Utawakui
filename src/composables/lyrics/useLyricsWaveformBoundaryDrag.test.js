import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { useLyricsTimingEditor } from '../useLyricsTimingEditor.js';
import { useLyricsWaveformBoundaryDrag } from './useLyricsWaveformBoundaryDrag.js';

let scope;
const editor = useLyricsTimingEditor();
afterEach(() => {
  scope?.stop();
  editor.cancel();
});
function setup() {
  editor.beginLine(
    {
      lines: [
        {
          lineId: 'before',
          text: 'A',
          startMs: 0,
          endMs: 3000,
          endInferred: true,
        },
        { lineId: 'line', text: 'B', startMs: 3000, endMs: 6000 },
        { lineId: 'after', text: 'C', startMs: 7000, endMs: null },
      ],
    },
    'line',
    null,
    { id: 'session' },
    { mode: 'line' },
  );
  const enabled = shallowRef(true),
    context = shallowRef('source-a');
  const viewport = shallowRef({ fromMs: 0, toMs: 10000 });
  const offset = shallowRef(1000);
  const commit = vi.fn((kind, value) =>
    kind === 'start' ? editor.setLineStart(value) : editor.setLineEnd(value),
  );
  scope = effectScope();
  const drag = scope.run(() =>
    useLyricsWaveformBoundaryDrag({
      enabled,
      context,
      draft: editor.draft,
      viewport,
      offsetMs: offset,
      durationMs: 20000,
      preview: (kind, value) => editor.previewLineTiming(kind, value),
      commit,
      freeze: vi.fn(),
    }),
  );
  const target = {
    closest: () => ({
      getBoundingClientRect: () => ({ left: 10, width: 500 }),
    }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  const event = (x, id = 1) => ({
    button: 0,
    pointerId: id,
    clientX: x,
    currentTarget: target,
    preventDefault: vi.fn(),
  });
  return { drag, event, commit, enabled, context, viewport, offset, target };
}
it('previews canonical time with offset, then commits one gesture and inferred dependency as one undo', () => {
  const { drag, event, commit } = setup();
  expect(drag.begin(event(110), 'start')).toBe(true); // media 2000 + offset 1000
  drag.move(event(135)); // canonical 3500
  drag.move(event(160)); // canonical 4000
  expect(drag.previewLine.value.startMs).toBe(4000);
  expect(editor.draft.value.startMs).toBe(3000);
  expect(editor.canUndo.value).toBe(false);
  drag.finish(event(160));
  expect(commit).toHaveBeenCalledExactlyOnceWith('start', 4000);
  expect(editor.dependencies.value[0].endMs).toBe(4000);
  editor.undo();
  expect(editor.draft.value.startMs).toBe(3000);
  expect(editor.canUndo.value).toBe(false);
});
it('rejects invalid final ranges instead of committing the last valid preview', () => {
  const { drag, event, commit } = setup();
  drag.begin(event(110), 'start');
  drag.move(event(160));
  drag.move(event(310)); // 7000 > end
  expect(drag.invalid.value).toBe(true);
  drag.finish(event(310));
  expect(commit).not.toHaveBeenCalled();
  expect(editor.draft.value.startMs).toBe(3000);
  expect(editor.validationError.value).toBe('');
});
it.each([
  'context',
  'offset',
  'viewport',
  'disabled',
  'draft',
  'cancel',
  'dispose',
])('rejects late pointerup after %s changes', (kind) => {
  const s = setup();
  s.drag.begin(s.event(110), 'start');
  s.drag.move(s.event(160));
  if (kind === 'context') s.context.value = 'source-b';
  if (kind === 'offset') s.offset.value = 2000;
  if (kind === 'viewport') s.viewport.value = { fromMs: 1000, toMs: 11000 };
  if (kind === 'disabled') s.enabled.value = false;
  if (kind === 'draft') editor.setLineEnd(6500);
  if (kind === 'cancel') s.drag.cancel(s.event(160));
  if (kind === 'dispose') scope.stop();
  s.drag.finish(s.event(160));
  expect(s.commit).not.toHaveBeenCalled();
  expect(s.drag.previewLine.value).toBeNull();
});
it('ignores foreign pointers, tiny clicks and missing endpoints; keyboard uses the same validation and media bounds', () => {
  const { drag, event, commit } = setup();
  drag.begin(event(110), 'start');
  drag.move(event(160, 2));
  drag.finish(event(112));
  expect(commit).not.toHaveBeenCalled();
  const key = (key) => ({
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
  drag.key(key('ArrowRight'), 'end');
  expect(commit).toHaveBeenLastCalledWith('end', 6100);
  expect(drag.key(key('Enter'), 'end')).toBe(false);
  editor.cancel();
  expect(drag.begin(event(110), 'end')).toBe(false);
});
it('uses complete-document segment validation without changing errors or inventing an unknown end', () => {
  setup();
  editor.beginLine(
    {
      lines: [
        {
          lineId: 't2',
          text: 'AB',
          startMs: 3000,
          endMs: 6000,
          segments: [
            { text: 'A', startMs: 3000, endMs: 4000 },
            { text: 'B', startMs: 4000, endMs: 6000 },
          ],
        },
      ],
    },
    't2',
    null,
    null,
    { mode: 'line' },
  );
  expect(editor.previewLineTiming('start', 3500)).toBeNull();
  expect(editor.previewLineTiming('end', 5500)).toBeNull();
  expect(editor.previewLineTiming('end', 6500).endMs).toBe(6500);
  expect(editor.draft.value.endMs).toBe(6000);
  expect(editor.canUndo.value).toBe(false);
  expect(editor.validationError.value).toBe('');
  editor.beginLine(
    { lines: [{ lineId: 't1', text: 'Unknown', startMs: 3000, endMs: null }] },
    't1',
    null,
    null,
    { mode: 'line' },
  );
  expect(editor.previewLineTiming('start', 3200).endMs).toBeNull();
});
