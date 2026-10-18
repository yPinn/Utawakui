import { readFileSync } from 'node:fs';
import { compileScript, parse } from '@vue/compiler-sfc';
import { describe, expect, it, vi } from 'vitest';

const { descriptor } = parse(
  readFileSync(
    new URL('./MusicAnalysisReferenceAnnotation.vue', import.meta.url),
    'utf8',
  ),
);
const node = compileScript(descriptor, {
  id: 'reference-action-test',
}).scriptSetupAst.find(
  (node) =>
    node.type === 'FunctionDeclaration' && node.id.name === 'removeBoundary',
);
function makeAction(confirmed) {
  const selectedCase = {
    value: {
      id: 'case1',
      referenceSections: [
        { startMs: 0, role: 'verse' },
        { startMs: 1000, role: 'chorus' },
      ],
    },
  };
  const removeBoundary = vi.fn();
  const annotation = { selectedCase, removeBoundary };
  const confirmAction = vi.fn().mockImplementation(confirmed);
  const run = new Function(
    'annotation',
    'confirmAction',
    `${descriptor.scriptSetup.content.slice(node.start, node.end)};return removeBoundary;`,
  )(annotation, confirmAction);
  return { run, annotation, confirmAction, removeBoundary };
}
describe('reference boundary removal', () => {
  it.each([false, true])(
    'confirms automatically saved boundary loss: %s',
    async (approved) => {
      const actions = makeAction(() => Promise.resolve(approved));
      await actions.run(1);
      expect(actions.confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'danger',
          detail: expect.stringContaining('自動儲存'),
        }),
      );
      expect(actions.removeBoundary.mock.calls).toEqual(
        approved ? [['case1', 1]] : [],
      );
    },
  );
  it('never applies an old confirmation to changed annotations', async () => {
    let finish;
    const actions = makeAction(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = actions.run(1);
    actions.annotation.selectedCase.value = {
      id: 'case2',
      referenceSections: [],
    };
    finish(true);
    await pending;
    expect(actions.removeBoundary).not.toHaveBeenCalled();
  });
  it('does not offer removal of the first boundary', async () => {
    const actions = makeAction(() => Promise.resolve(true));
    await actions.run(0);
    expect(actions.confirmAction).not.toHaveBeenCalled();
    expect(actions.removeBoundary).not.toHaveBeenCalled();
  });
  it('accepts an unchanged autosave snapshot without relying on object identity', async () => {
    let finish;
    const actions = makeAction(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = actions.run(1);
    actions.annotation.selectedCase.value = structuredClone(
      actions.annotation.selectedCase.value,
    );
    finish(true);
    await pending;
    expect(actions.removeBoundary).toHaveBeenCalledExactlyOnceWith('case1', 1);
  });
  it('rejects changed roles even when the case id stays the same', async () => {
    let finish;
    const actions = makeAction(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = actions.run(1);
    actions.annotation.selectedCase.value.referenceSections[1].role = 'bridge';
    finish(true);
    await pending;
    expect(actions.removeBoundary).not.toHaveBeenCalled();
  });
});
