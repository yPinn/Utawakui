<template>
  <div class="app-loose-leaf-edge" aria-hidden="true">
    <div class="app-loose-leaf-edge__binding-field">
      <div class="app-loose-leaf-edge__holes">
        <span
          v-for="hole in 3"
          :key="hole"
          class="app-loose-leaf-edge__hole"
        ></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-loose-leaf-edge {
  position: absolute;
  z-index: var(--ui-layer-raised);
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--ui-folder-sheet-binding-gutter);
  box-sizing: border-box;
  border-inline-end: var(--ui-border-width) solid
    var(--ui-folder-sheet-margin-rule);
  pointer-events: none;
}

.app-loose-leaf-edge__binding-field {
  position: absolute;
  inset-block-start: 0;
  inline-size: 100%;
  block-size: min(100%, var(--ui-folder-sheet-binding-field-max-block-size));
  display: grid;
  align-items: center;
}

.app-loose-leaf-edge__holes {
  inline-size: 100%;
  block-size: min(
    var(--ui-folder-sheet-hole-rail-block-size),
    calc(100% - var(--ui-folder-sheet-hole-edge-inset) * 2)
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
}

.app-loose-leaf-edge__hole {
  box-sizing: border-box;
  inline-size: var(--ui-folder-sheet-hole-size);
  block-size: var(--ui-folder-sheet-hole-size);
  flex: 0 0 auto;
  border: var(--ui-border-width) solid var(--ui-folder-sheet-hole-rim);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-folder-layout-background);
}
</style>
