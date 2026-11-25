<script setup>
// Illustrations for the three destinations: abstract shapes in app tokens, not UI captures.
defineProps({
  kind: {
    type: String,
    required: true,
    validator: (v) => ['library', 'performance', 'output'].includes(v),
  },
});
</script>

<template>
  <div class="illo" :class="`illo--${kind}`" aria-hidden="true">
    <!-- Library: a stack of folders in the three materials, a sheet peeking out. -->
    <template v-if="kind === 'library'">
      <span class="folder folder--back" />
      <span class="folder folder--mid" />
      <span class="sheet"><i /><i /><i /></span>
      <span class="folder folder--front" />
    </template>

    <!-- Performance: a lyric sheet with the current line marked and the active chunk underlined. -->
    <template v-else-if="kind === 'performance'">
      <span class="page">
        <i class="bar" />
        <i class="bar bar--current"><b /></i>
        <i class="bar" />
        <i class="bar bar--short" />
      </span>
      <span class="note note--a">♪</span>
      <span class="note note--b">♪</span>
    </template>

    <!-- Output: a screen with a now-playing chip and a caption bar. -->
    <template v-else>
      <span class="screen">
        <i class="chip" />
        <i class="caption"><b /></i>
      </span>
      <span class="stand" />
    </template>
  </div>
</template>

<style scoped>
.illo {
  position: relative;
  width: clamp(16rem, 30vw, 26rem);
  aspect-ratio: 1;
}

/* Folders: material body with a tab, offset into a fan. */
.folder {
  position: absolute;
  inset: 22% 6% 8%;
  border-radius: 0 var(--site-radius) var(--site-radius);
  box-shadow: var(--site-shadow);
}

.folder::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 38%;
  height: 12%;
  border-radius: var(--site-radius) var(--site-radius) 0 0;
  background: inherit;
}

.folder--back {
  background: var(--ui-color-folder-tertiary);
  transform: rotate(-9deg) translate(-6%, -4%);
}

.folder--mid {
  background: var(--ui-color-folder-secondary);
  transform: rotate(5deg) translate(4%, -2%);
}

.folder--front {
  inset: 40% 2% 4%;
  background: var(--ui-palette-indigo-700);
}

.sheet {
  position: absolute;
  inset: 14% 16% 30%;
  display: grid;
  align-content: start;
  gap: 10%;
  padding: 10% 12%;
  border-radius: var(--ui-radius-md);
  background: var(--site-paper);
  box-shadow: var(--site-shadow-soft);
  transform: rotate(-2deg);
}

.sheet i,
.bar {
  display: block;
  height: 0.6rem;
  border-radius: var(--site-radius-pill);
  background: var(--ui-color-border);
}

.sheet i:nth-child(2) {
  width: 70%;
}

/* Lyric page. */
.page {
  position: absolute;
  inset: 8% 14%;
  display: grid;
  align-content: center;
  gap: 1.4rem;
  padding: 0 14%;
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--site-shadow);
  transform: rotate(3deg);
}

.bar--current {
  position: relative;
  height: 1.1rem;
  background: color-mix(in srgb, var(--ui-palette-amber-300) 85%, transparent);
}

.bar--current b {
  position: absolute;
  left: 30%;
  bottom: -0.45rem;
  width: 32%;
  height: 0.25rem;
  border-radius: var(--site-radius-pill);
  background: var(--ui-color-accent);
}

.bar--short {
  width: 60%;
}

.note {
  position: absolute;
  display: grid;
  place-items: center;
  width: 3.5rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--ui-color-folder-secondary);
  box-shadow: var(--site-shadow-soft);
  color: var(--ui-color-folder-secondary-foreground);
  font-size: var(--ui-font-size-xl);
}

.note--a {
  top: 2%;
  right: 4%;
}

.note--b {
  bottom: 4%;
  left: 2%;
  width: 2.75rem;
  background: var(--ui-color-folder-tertiary);
  color: var(--ui-color-folder-tertiary-foreground);
}

/* Screen on a stand. */
.screen {
  position: absolute;
  inset: 14% 2% 26%;
  border: var(--ui-space-3) solid var(--ui-palette-neutral-900);
  border-radius: var(--site-radius);
  background: linear-gradient(
    160deg,
    var(--ui-palette-indigo-800),
    var(--ui-palette-indigo-950) 60%,
    var(--ui-palette-plum-700)
  );
  box-shadow: var(--site-shadow);
}

.chip {
  position: absolute;
  top: 10%;
  left: 7%;
  width: 34%;
  height: 12%;
  border-radius: var(--site-radius-pill);
  background: var(--site-paper);
}

.caption {
  position: absolute;
  inset: auto 14% 12%;
  height: 10%;
  border-radius: var(--site-radius-pill);
  background: var(--ui-palette-warm-neutral-50);
}

.caption b {
  display: block;
  width: 45%;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-palette-amber-300);
}

.stand {
  position: absolute;
  bottom: 12%;
  left: 50%;
  width: 34%;
  height: 8%;
  border-radius: var(--ui-radius-md) var(--ui-radius-md) 0 0;
  background: var(--ui-palette-neutral-900);
  transform: translateX(-50%);
}
</style>
