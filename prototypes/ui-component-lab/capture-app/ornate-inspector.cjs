/* global module */

const ornateVariants = ['left', 'right'].flatMap((side) =>
  ['icon', 'text'].map((labels) => ({
    theme: 'light',
    state: 'default',
    tab: 'ornate',
    motion: 'reduced',
    query: {
      ...(side === 'left' ? { side } : {}),
      ...(labels === 'text' ? { labels } : {}),
    },
    name: `ornate-inspector-${side}-${labels}-1280x900.png`,
  })),
);

async function verifyOrnateInspector(window, { query }, verifyKeyboard) {
  const probe = (narrow = false) =>
    window.webContents.executeJavaScript(`(async () => {
      const paint = () => new Promise((resolve) => requestAnimationFrame(resolve));
      for (let frame = 0; frame < 120 && !document.querySelector('.ui-folder-inspector__workspace'); frame++) {
        await paint();
      }
      await paint();
      await paint();
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      const workspace = document.querySelector('.ui-folder-inspector__workspace');
      const side = ${JSON.stringify(query.side ?? 'right')};
      const labels = ${JSON.stringify(query.labels ?? 'icon')};
      assert(workspace?.dataset.side === side, 'wrong dock side');
      assert(workspace.dataset.labels === labels, 'wrong tab labels');
      const bounds = (selector) => workspace.querySelector(selector).getBoundingClientRect();
      const tab = (id) => document.getElementById('ornate-lab-' + id + '-tab');
      if (workspace.dataset.compact === 'true') {
        assert(workspace.dataset.open === 'false', 'narrow resize did not fold the panel');
        tab('layout').click();
        await paint();
      }
      const rail = bounds('.ui-folder-inspector__rail');
      const panel = bounds('.ui-folder-inspector__inspector');
      const stage = bounds('.ui-folder-inspector__main');
      const near = (left, right) => Math.abs(left - right) < 1;
      const tokenWidth = (name) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;width:var(' + name + ')';
        workspace.append(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      const firstTab = tab('layout').getBoundingClientRect();
      const nextTab = tab('text').getBoundingClientRect();
      const categoryOrder = [...workspace.querySelectorAll('[role="tab"]')]
        .map((element) => element.getAttribute('aria-label'));
      assert(categoryOrder.join('/') === '定位/文字/色彩', 'inspector categories are out of order');
      assert(tab('layout').getAttribute('aria-selected') === 'true', 'position is not the default category');
      const sectionTitles = [...document.querySelectorAll('#ornate-lab-layout-panel .obs-property-section__title')]
        .map((element) => element.textContent.trim());
      assert(sectionTitles.join('/') === '定位基準/位置微調', 'position properties are not grouped by tier');
      assert(near(firstTab.height, tokenWidth('--ui-folder-tool-tab-length')), 'tab length differs from the horizontal tool tab');
      assert(near(firstTab.width, tokenWidth(labels === 'icon' ? '--ui-folder-tool-tab-depth' : '--ui-folder-tool-tab-length')), 'wrong tab depth');
      assert(near(nextTab.top - firstTab.bottom, tokenWidth('--ui-folder-tool-tab-gap')), 'wrong spacing between tabs');
      const compact = workspace.dataset.compact === 'true';
      assert(panel.width > 0 && (compact ? near(stage.width, workspace.clientWidth - rail.width) : stage.width >= 288), 'preview and panel did not respect their width limits: ' + JSON.stringify({compact, stage: stage.width, panel: panel.width, viewport: innerWidth}));
      assert(
        side === 'left' ? near(panel.right, rail.left) : near(rail.right, panel.left),
        'panel did not open inward from its rail',
      );
      assert(panel.width >= 224 && panel.width <= 384, 'panel width exceeds its bounds');
      if (compact) {
        assert(near(panel.width, 288) && near(panel.height, stage.height), 'compact drawer default size is wrong');
        const overlap = side === 'left' ? panel.right > stage.left : panel.left < stage.right;
        const drawer = workspace.querySelector('.ui-folder-inspector__drawer');
        assert(overlap && getComputedStyle(drawer).position === 'absolute', 'compact drawer does not overlay the preview');
      }
      assert(
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        'inspector caused horizontal page overflow',
      );
      assert(Boolean(tab('layout').querySelector('svg')) === (labels === 'icon'), 'wrong visible label');
      const tabPaint = getComputedStyle(tab('layout'), '::before');
      const rotation = new DOMMatrix(tabPaint.transform);
      assert(side === 'right' ? rotation.b < 0 : rotation.b > 0, 'folder base does not face the panel');
      const assertTabTipGap = (stageBounds, railBounds) => {
        const tabBounds = tab('layout').getBoundingClientRect();
        const expectedGap = tokenWidth('--ui-side-panel-content-inset');
        const tipGap = side === 'left'
          ? stageBounds.left - tabBounds.right
          : tabBounds.left - stageBounds.right;
        const base = side === 'left' ? tabBounds.left : tabBounds.right;
        assert(expectedGap > 0 && near(tipGap, expectedGap), 'tab tip touches the preview edge');
        assert(near(base, side === 'left' ? railBounds.left : railBounds.right), 'tab base detached from the panel');
      };
      if (!compact) assertTabTipGap(stage, rail);
      const handle = workspace.querySelector('[role="separator"][aria-controls="ornate-lab-inspector"]');
      const panelPaint = getComputedStyle(handle, '::before');
      assert(
        near(parseFloat(panelPaint.inlineSize), tokenWidth('--ui-folder-tool-tab-seam-width')),
        'vertical seam does not use the shared folder tool stroke',
      );
      assert(
        panelPaint.backgroundColor === tabPaint.backgroundColor,
        'selected folder tab and adjacent panel edge do not share the same color',
      );
      const frame = workspace.getBoundingClientRect();
      assert(
        side === 'left'
          ? near(panel.left, frame.left + workspace.clientLeft)
          : near(panel.right, frame.left + workspace.clientLeft + workspace.clientWidth),
        'panel is not anchored to the outer page edge',
      );

      const handleBounds = handle.getBoundingClientRect();
      assert(near(handleBounds.left + handleBounds.width / 2, side === 'left' ? rail.left : rail.right), 'resize line does not meet the tab base');
      assert(!workspace.querySelector('button[aria-controls="ornate-lab-inspector"]'), 'separate disclosure button remains');
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
      await paint();
      const expandedStage = bounds('.ui-folder-inspector__main');
      assert(
        near(expandedStage.width, compact ? stage.width : stage.width + panel.width) &&
          near(expandedStage.height, stage.height),
        'collapse changed the compact preview geometry or did not reclaim the wide preview width',
      );
      const closedRail = bounds('.ui-folder-inspector__rail');
      assertTabTipGap(expandedStage, closedRail);
      assert(
        near(closedRail.left - rail.left, side === 'left' ? -panel.width : panel.width),
        'rail did not return to the page edge',
      );
      assert(handle.getAttribute('aria-valuenow') === '0', 'wrong collapsed width');
      tab('layout').click();
      await paint();
      const reopenedStage = bounds('.ui-folder-inspector__main');
      assert(near(reopenedStage.width, stage.width) && near(reopenedStage.height, stage.height), 'reopen changed the preview geometry');
      const dismiss = workspace.querySelector('.ui-folder-inspector__preview-dismiss');
      if (compact) {
        assert(dismiss, 'compact preview has no dismissal target');
        const x = side === 'left' ? reopenedStage.right - 4 : reopenedStage.left + 4;
        assert(document.elementFromPoint(x, reopenedStage.top + 12) === dismiss, 'preview dismissal target is covered');
        dismiss.click();
        await paint();
        assert(workspace.dataset.open === 'false' && document.activeElement === handle, 'preview click did not dismiss and restore focus');
        tab('layout').click();
        await paint();
      } else {
        assert(!dismiss, 'wide preview has a dismissal target');
      }

      if (!${narrow}) {
        const arrow = (key) => handle.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
        arrow(side === 'left' ? 'ArrowLeft' : 'ArrowRight');
        await paint();
        assert(near(bounds('.ui-folder-inspector__inspector').width, panel.width - tokenWidth('--ui-space-2')), 'outward arrow did not shrink the panel');
        arrow(side === 'left' ? 'ArrowRight' : 'ArrowLeft');
        await paint();
        assert(near(bounds('.ui-folder-inspector__inspector').width, panel.width), 'inward arrow did not restore the width');
      }

      if (${verifyKeyboard} && !${narrow}) {
        tab('layout').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        await new Promise((resolve) => setTimeout(resolve, 550));
        assert(document.querySelector('[role="tooltip"]')?.textContent.trim() === '定位', 'icon hover did not show its label');
        tab('layout').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        await new Promise((resolve) => setTimeout(resolve, 150));
        tab('color').click();
        await paint();
        const color = document.getElementById('output-appearance-textColor');
        color.value = '#bada55';
        color.dispatchEvent(new Event('input', { bubbles: true }));
        await paint();
        tab('layout').click();
        await paint();
        tab('layout').focus({ preventScroll: true });
        const step = (id, key) => tab(id).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
        step('layout', 'ArrowDown');
        await paint();
        assert(document.activeElement === tab('text'), 'ArrowDown did not move focus');
        assert(tab('text').getAttribute('aria-selected') === 'true', 'ArrowDown did not activate');
        assert(document.getElementById(tab('text').getAttribute('aria-controls')).offsetWidth > 0, 'linked panel stayed hidden');
        step('text', 'End');
        await paint();
        assert(document.activeElement === tab('color'), 'End did not reach the last tab');
        step('color', 'ArrowUp');
        await paint();
        assert(document.activeElement === tab('text'), 'ArrowUp did not move focus');
        step('text', 'Home');
        await paint();
        assert(document.activeElement === tab('layout'), 'Home did not reach the first tab');
        assert(color.value === '#bada55', 'switching tabs lost the edited color');
        const preview = workspace.querySelector('.obs-template-mockup');
        assert(preview.style.getPropertyValue('--ui-output-preview-text') === '#bada55', 'preview did not receive the color');
        workspace.querySelector('.ui-folder-inspector__footer button').click();
        await paint();
        assert(color.value.toLowerCase() === '#fff8ec', 'template reset did not restore the color');
        const choose = (name, index) => {
          const group = document.querySelector('[role="radiogroup"][aria-label="' + name + '"]');
          group.querySelectorAll('[role="radio"]')[index].click();
        };
        choose('工具欄位置', 1);
        choose('頁籤標示', 1);
        await paint();
        assert(workspace.dataset.side === 'right', 'placement control did not move the rail');
        assert(workspace.dataset.labels === 'text', 'label control did not show short text');
        assert(near(bounds('.ui-folder-inspector__rail').right, bounds('.ui-folder-inspector__inspector').left), 'right dock did not place the panel to the right of its tabs');
        choose('工具欄位置', 0);
        choose('頁籤標示', 0);
        await paint();
      }
    })()`);

  await probe();
  if (verifyKeyboard) {
    window.webContents.focus();
    await window.webContents.executeJavaScript(
      "document.getElementById('ornate-lab-layout-tab').focus()",
    );
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
    await window.webContents.executeJavaScript(`(async () => {
      for (let frame = 0; frame < 8; frame++) {
        if (
          document.activeElement?.id === 'ornate-lab-text-tab' &&
          document.querySelector('[role="tooltip"]')?.textContent.trim() === '文字'
        ) return;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      throw new Error('keyboard navigation did not show the icon tooltip');
    })()`);
    await window.webContents.executeJavaScript(
      "document.getElementById('ornate-lab-layout-tab').click()",
    );
  }
  for (const width of [700, 500]) {
    window.setContentSize(width, 760);
    await probe(true);
  }
  if (!query.labels) await verifySlide(window);
  window.setContentSize(1280, 900);
  if (!query.labels) await verifyPointerResize(window);
  if (verifyKeyboard) {
    await verifyResponsiveFold(window);
    await verifyShortTabRail(window);
  }
}

async function verifyResponsiveFold(window) {
  await window.webContents.executeJavaScript(`(async () => {
    const root = document.querySelector('.ornate-lab__inspector');
    const workspace = root.querySelector('.ui-folder-inspector__workspace');
    const tab = root.querySelector('[role="tab"]');
    const handle = root.querySelector('[role="separator"]');
    const resize = async (width, compact, open) => {
      root.style.inlineSize = width;
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (workspace.dataset.compact === String(compact) &&
            workspace.dataset.open === String(open) &&
            Math.abs(root.getBoundingClientRect().width - parseFloat(width)) < 1) return;
      }
      throw new Error('wrong responsive panel state at ' + width + ': ' + JSON.stringify({
        width: root.getBoundingClientRect().width,
        workspaceWidth: workspace.clientWidth,
        compact: workspace.dataset.compact,
        open: workspace.dataset.open,
      }));
    };
    await resize('520px', true, false);
    tab.click();
    await resize('600px', true, true);
    await resize('640px', false, true);
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }));
    await resize('520px', true, false);
    tab.click();
    await resize('600px', true, true);
    await resize('640px', false, false);
    tab.click();
    root.style.inlineSize = '';
  })()`);
}

async function verifyShortTabRail(window) {
  await window.webContents.executeJavaScript(`(async () => {
    const root = document.querySelector('.ornate-lab__inspector');
    const tabs = root.querySelector('[role="tablist"]');
    const items = [...tabs.querySelectorAll('[role="tab"]')];
    const last = items.at(-1);
    root.style.blockSize = '112px';
    if (tabs.scrollHeight <= tabs.clientHeight)
      throw new Error('short tab rail does not offer a scrollable area');
    items[0].dispatchEvent(new KeyboardEvent('keydown', {
      key: 'End',
      cancelable: true,
    }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const bounds = last.getBoundingClientRect();
    const viewport = tabs.getBoundingClientRect();
    if (document.activeElement !== last || bounds.bottom > viewport.bottom + 1)
      throw new Error('keyboard selection did not reveal the last tab in the short rail');
    root.style.blockSize = '';
    items[0].click();
  })()`);
}

async function verifySlide(window) {
  await window.webContents.executeJavaScript(`(async () => {
    document.documentElement.dataset.uiMotion = 'full';
    const workspace = document.querySelector('.ui-folder-inspector__workspace');
    const panel = workspace.querySelector('.ui-folder-inspector__inspector');
    const rail = workspace.querySelector('.ui-folder-inspector__rail');
    const stage = workspace.querySelector('.ui-folder-inspector__main');
    const handle = workspace.querySelector('[role="separator"][aria-controls="ornate-lab-inspector"]');
    const paint = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await paint();
    const openWidth = panel.getBoundingClientRect().width;
    const preview = stage.getBoundingClientRect();
    const openedRail = rail.getBoundingClientRect();
    const left = workspace.dataset.side === 'left';

    for (const open of [false, true]) {
      handle.dispatchEvent(new MouseEvent('dblclick'));
      await Promise.resolve();
      const [transition] = panel.getAnimations();
      if (!transition) throw new Error('drawer has no width transition');
      transition.pause();
      transition.currentTime = transition.effect.getTiming().duration / 2;
      const width = panel.getBoundingClientRect().width;
      if (width <= 2 || width >= openWidth - 2)
        throw new Error('drawer jumped without a sliding frame');
      const railLeft = rail.getBoundingClientRect().left;
      const expected = openedRail.left + (openWidth - width) * (left ? -1 : 1);
      if (Math.abs(railLeft - expected) > 1)
        throw new Error('tabs did not move with the edge of the sliding panel');
      const during = stage.getBoundingClientRect();
      if (during.x !== preview.x || during.width !== preview.width || during.height !== preview.height)
        throw new Error('compact animation moved the preview');
      transition.finish();
      if (Math.abs(panel.getBoundingClientRect().width - (open ? openWidth : 0)) > 0.5)
        throw new Error('drawer did not settle at its target width');
      if (panel.inert === open) throw new Error('collapsed drawer remained interactive');
    }
  })()`);
}

async function verifyPointerResize(window) {
  const contents = window.webContents;
  contents.focus();
  await contents.executeJavaScript(`(async () => {
    document.documentElement.dataset.uiMotion = 'reduced';
    const workspace = document.querySelector('.ui-folder-inspector__workspace');
    for (let frame = 0; frame < 10; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (workspace.dataset.compact === 'false' && innerWidth === 1280) return;
    }
    throw new Error('wide layout did not settle before the drag check');
  })()`);
  const geometry = () =>
    contents.executeJavaScript(`(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const handle = document.querySelector('.ui-folder-inspector__resize');
      const workspace = handle.closest('.ui-folder-inspector__workspace');
      const panel = document.getElementById('ornate-lab-inspector');
      const preview = document.querySelector('.ui-folder-inspector__main').getBoundingClientRect();
      const bounds = handle.getBoundingClientRect();
      return {
        x: Math.round(bounds.left + bounds.width / 2),
        y: Math.round(bounds.bottom - bounds.height / 4),
        width: panel.getBoundingClientRect().width,
        ready: handle.dataset.resizeReady === 'true',
        seamColor: getComputedStyle(handle, '::before').backgroundColor,
        tabColor: getComputedStyle(workspace.querySelector('[role="tab"][aria-selected="true"]') ?? handle, '::before').backgroundColor,
        preview: [preview.x, preview.y, preview.width, preview.height],
        moving: panel.getAnimations().length > 0,
        sign: handle.closest('[data-side]').dataset.side === 'left' ? 1 : -1,
        open: !panel.inert,
      };
    })()`);

  async function drag(start, inward) {
    const { x, y, sign } = start;
    contents.sendInputEvent({
      type: 'mouseDown',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    const end = x + Math.round(inward * sign);
    contents.sendInputEvent({
      type: 'mouseMove',
      x: end,
      y,
      modifiers: ['leftButtonDown'],
    });
    const moving = await geometry();
    if (moving.open !== start.open || moving.moving)
      throw new Error(
        `drag changed disclosure state before release: ${JSON.stringify({ start, moving })}`,
      );
    contents.sendInputEvent({
      type: 'mouseUp',
      x: end,
      y,
      button: 'left',
      clickCount: 1,
    });
    return { moving, settled: await geometry() };
  }

  const start = await geometry();
  const widened = await drag(start, 40);
  if (
    widened.moving.ready ||
    widened.moving.seamColor !== widened.moving.tabColor ||
    Math.abs(widened.moving.width - start.width - 40) > 1 ||
    Math.abs(widened.moving.x - start.x - start.sign * 40) > 1 ||
    Math.abs(widened.moving.preview[2] - start.preview[2] + 40) > 1 ||
    Math.abs(widened.settled.width - start.width - 40) > 1 ||
    !widened.settled.open ||
    widened.settled.moving ||
    widened.settled.ready
  )
    throw new Error(
      `drag did not resize the open panel: ${JSON.stringify({ start, widened })}`,
    );
  const snapped = await drag(widened.settled, 128 - widened.settled.width);
  if (
    snapped.moving.ready ||
    Math.abs(snapped.moving.width - 224) > 1 ||
    !snapped.settled.open ||
    Math.abs(snapped.settled.width - 224) > 1
  )
    throw new Error('drawer did not stop at the minimum expanded width');
  const closed = await drag(snapped.settled, 96 - snapped.settled.width);
  if (
    !closed.moving.ready ||
    closed.moving.width !== snapped.settled.width ||
    closed.moving.x !== snapped.settled.x ||
    closed.settled.open ||
    closed.settled.width > 1
  )
    throw new Error('outward drag did not collapse the panel');
  const reopened = await drag(closed.settled, start.width);
  if (
    !reopened.moving.ready ||
    reopened.moving.width > 1 ||
    reopened.moving.x !== closed.settled.x ||
    !reopened.settled.open ||
    Math.abs(reopened.settled.width - start.width) > 1
  )
    throw new Error('inward drag did not reopen the panel');
}

module.exports = { ornateVariants, verifyOrnateInspector };
