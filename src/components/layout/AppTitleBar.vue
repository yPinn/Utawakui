<template>
  <header class="app-titlebar" aria-hidden="true"></header>
</template>

<style scoped>
.app-titlebar {
  box-sizing: border-box;
  height: var(--ui-titlebar-height);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
  user-select: none;
  app-region: drag;
  -webkit-app-region: drag;
}
</style>
