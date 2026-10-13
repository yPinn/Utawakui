import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import DemoSearchBoxAppearance from './DemoSearchBoxAppearance.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
attachClientRender(
  DemoSearchBoxAppearance,
  './DemoSearchBoxAppearance.vue',
  import.meta.url,
);
attachClientRender(UiSearchBox, '../ui/UiSearchBox.vue', import.meta.url);
attachClientRender(UiTooltip, '../ui/UiTooltip.vue', import.meta.url);
attachClientRender(
  UiTooltipSurface,
  '../ui/tooltip/UiTooltipSurface.vue',
  import.meta.url,
);
const componentSource = readFileSync(
  new URL('./DemoSearchBoxAppearance.vue', import.meta.url),
  'utf8',
);
describe('DemoSearchBoxAppearance', () => {
  it('keeps every F8 search specimen controlled so Clear removes its query', async () => {
    expect(componentSource).toContain("import { reactive } from 'vue';");
    expect(componentSource).toContain(
      'v-model="specimenValues[layer.key].sizes[size[0]]"',
    );
    expect(componentSource).toContain(
      'v-model="specimenValues[layer.key].widths[width.key]"',
    );
    expect(componentSource).toContain(
      'v-model="specimenValues[layer.key].states[state.key]"',
    );
    const { app, root } = mount(DemoSearchBoxAppearance);
    const findInput = () =>
      findAll(
        root,
        (node) =>
          node.type === 'input' &&
          node.props.id === 'demo-search-candidate-state-clear-hover',
      )[0];
    expect(findInput().props.value).toBe('Hover Clear');
    const clear = findAll(
      findInput().parent,
      (node) => node.props?.['aria-label'] === '清除搜尋',
    )[0];
    trigger(clear, 'onClick');
    await nextTick();
    expect(findInput().props.value).toBe('');
    expect(
      findAll(
        findInput().parent,
        (node) => node.props?.['aria-label'] === '清除搜尋',
      ),
    ).toHaveLength(0);
    app.unmount();
  });
});
