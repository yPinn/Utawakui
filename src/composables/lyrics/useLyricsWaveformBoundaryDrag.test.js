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
    kind === 'move'
      ? editor.shiftLine(value)
      : kind === 'start'
        ? editor.setLineStart(value)
        : editor.setLineEnd(value),
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
it('previews a whole-line delta, preserves segments and commits inferred dependencies in one undo', () => {
  const s = setup();
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
        {
          lineId: 'line',
          text: 'AB',
          startMs: 3000,
          endMs: 6000,
          endInferred: true,
          segments: [
            { segmentId: 's1', text: 'A', startMs: 3000, endMs: 4000 },
            { segmentId: 's2', text: 'B', startMs: 4500, endMs: 5500 },
          ],
        },
        { lineId: 'after', text: 'C', startMs: 6000, endMs: null },
      ],
    },
    'line',
    null,
    { id: 'session' },
    { mode: 'line' },
  );
  const before = JSON.stringify(editor.draft.value);
  expect(s.drag.begin(s.event(150), 'move')).toBe(true);
  s.drag.move(s.event(175));
  expect(s.drag.previewLine.value).toMatchObject({
    startMs: 3500,
    endMs: 6500,
    segments: [
      { segmentId: 's1', text: 'A', startMs: 3500, endMs: 4500 },
      { segmentId: 's2', text: 'B', startMs: 5000, endMs: 6000 },
    ],
  });
  expect(s.drag.previewLine.value.endInferred).toBeUndefined();
  expect(JSON.stringify(editor.draft.value)).toBe(before);
  expect(editor.canUndo.value).toBe(false);
  // Reverse within the same capture, then use the final release position.
  s.drag.move(s.event(140));
  s.drag.finish(s.event(160));
  expect(s.commit).toHaveBeenCalledExactlyOnceWith('move', 200);
  expect(editor.dependencies.value[0].endMs).toBe(3200);
  expect(editor.draft.value.startMs).toBe(3200);
  editor.undo();
  expect(JSON.stringify(editor.draft.value)).toBe(before);
  expect(editor.canUndo.value).toBe(false);
});
it.each([
  'context',
  'offset',
  'viewport',
  'disabled',
  'draft',
  'cancel',
  'dispose',
  'escape',
  'lost capture',
])('cancels whole-line preview on %s and rejects late release', (kind) => {
  const s = setup();
  s.drag.begin(s.event(150), 'move');
  s.drag.move(s.event(175));
  expect(s.drag.previewLine.value.startMs).toBe(3500);
  if (kind === 'context') {
    s.context.value = 'source-b';
    s.context.value = 'source-a';
  }
  if (kind === 'offset') s.offset.value = 2000;
  if (kind === 'viewport') s.viewport.value = { fromMs: 1000, toMs: 11000 };
  if (kind === 'disabled') s.enabled.value = false;
  if (kind === 'draft') editor.setLineEnd(6500);
  if (kind === 'cancel' || kind === 'lost capture') s.drag.cancel(s.event(175));
  if (kind === 'dispose') scope.stop();
  if (kind === 'escape')
    s.drag.key(
      { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() },
      'move',
    );
  s.drag.finish(s.event(175));
  expect(s.commit).not.toHaveBeenCalled();
  expect(s.drag.previewLine.value).toBeNull();
});
it('rejects a final invalid move, enforces both media edges, and leaves unknown tails unknown', () => {
  const s = setup();
  s.drag.begin(s.event(150), 'move');
  s.drag.move(s.event(175));
  s.drag.finish(s.event(400)); // next start exceeds following start
  expect(s.commit).not.toHaveBeenCalled();
  expect(s.drag.invalid.value).toBe(true);
  expect(editor.validationError.value).toBe('');
  editor.beginLine(
    { lines: [{ lineId: 'last', text: 'tail', startMs: 18000, endMs: 20500 }] },
    'last',
    null,
    null,
    { mode: 'line' },
  );
  s.drag.begin(s.event(150), 'move');
  s.drag.finish(s.event(200)); // end media 20500 exceeds 20000
  expect(s.commit).not.toHaveBeenCalled();
  editor.beginLine(
    { lines: [{ lineId: 'last', text: 'tail', startMs: 3000, endMs: null }] },
    'last',
    null,
    null,
    { mode: 'line' },
  );
  s.drag.begin(s.event(150), 'move');
  s.drag.finish(s.event(40)); // media -200, canonical still positive
  expect(s.commit).not.toHaveBeenCalled();
  s.drag.key(
    { key: 'ArrowRight', preventDefault: vi.fn(), stopPropagation: vi.fn() },
    'move',
  );
  expect(s.commit).toHaveBeenCalledExactlyOnceWith('move', 100);
  expect(editor.draft.value).toMatchObject({
    startMs: 3100,
    endMs: null,
    segments: [],
  });
});
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
