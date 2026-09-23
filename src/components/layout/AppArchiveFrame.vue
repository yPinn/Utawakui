<script setup>
import AppInnerPage from './AppInnerPage.vue';
import AppTopTabs from './AppTopTabs.vue';

defineProps({
  activeView: { type: String, required: true },
  tabActiveView: { type: String, default: '' },
  updateAvailable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:activeView']);
</script>

<template>
  <section
    class="app-archive-frame"
    :class="{ 'app-archive-frame--with-context': $slots.context }"
  >
    <div class="app-archive-frame__primary">
      <AppTopTabs
        class="app-archive-frame__tabs"
        :active-view="tabActiveView || activeView"
        :update-available="updateAvailable"
        @update:active-view="emit('update:activeView', $event)"
      />
      <AppInnerPage class="app-archive-frame__page">
        <slot />
      </AppInnerPage>
    </div>
    <div v-if="$slots.context" class="app-archive-frame__context">
      <slot name="context" />
    </div>
  </section>
</template>

<style scoped>
.app-archive-frame {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  /* Clamped, not min-height — AppInnerPage's own scroll (see its CSS) only
     works if every ancestor up to .shell__main hands down a real, bounded
     height instead of "grow to fit content." */
  height: 100%;
  min-height: 0;
}

.app-archive-frame--with-context {
  grid-template-columns: minmax(0, 1fr) auto;
  /* Not --ui-shell-gutter — that token only exists in the Token v2 sheet,
     and this file is production (always loaded, not gated behind
     data-ui-system='v2'). It happened to resolve today only because the
     context slot itself is currently Studio Library Candidate-only, which
     always runs alongside v2. --ui-space-3 matches .shell__main's own gap
     to the sidebar (see App.vue), so primary-to-context and sidebar-to-main
     read as the same distance instead of one silently depending on a
     token this file has no contract with. */
  gap: var(--ui-space-3);
}

.app-archive-frame__primary {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.app-archive-frame__tabs {
  position: relative;
  /* Below the page panel (z-index: 1) — the panel's top edge should
     paint over the tabs in the overlap zone, so the tabs read as tucked
     underneath it rather than poking out in front of it. */
  z-index: 0;
  margin-bottom: calc(-1 * var(--ui-archive-rail-size));
}

.app-archive-frame__page {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.app-archive-frame__context {
  display: flex;
  min-width: 0;
  min-height: 0;
  /* AppTopTabs only sits above .app-archive-frame__primary, not this
     column — so the top inset has to match that column's actual card
     start (--ui-archive-content-inset), not a plain symmetric gutter, for
     the context plane to share .shell__sidebar's/.shell__main's baseline.
     See --ui-archive-content-inset's own comment in tokens.css. Deliberately
     no bottom padding here — .shell__main already wraps this whole frame
     (both columns) in its own bottom gutter, so adding another one here
     would double it up and leave this column's bottom edge higher than the
     primary one's. */
  padding-top: var(--ui-archive-content-inset);
}

/* Paired with StudioLibraryContextInspector's compact projection. CSS custom
   properties cannot drive media-query conditions, so the behavior test keeps
   these two authored breakpoints synchronized. */
@media (max-width: 70rem) {
  .app-archive-frame--with-context {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .app-archive-frame__context {
    position: absolute;
    z-index: var(--ui-z-sticky);
    inset-block: 0;
    inset-inline-end: 0;
  }
}
</style>
