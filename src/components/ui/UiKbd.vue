<template>
  <kbd class="ui-kbd"><slot /></kbd>
</template>

<style scoped>
.ui-kbd {
  min-block-size: var(--ui-kbd-min-block-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--ui-kbd-padding-inline);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
  box-shadow: inset 0 calc(-1 * var(--ui-border-width)) 0 var(--ui-color-border);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
  -webkit-user-select: none;
  user-select: none;
}
</style>
