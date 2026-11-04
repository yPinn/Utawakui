<script setup>
import { ListMinus } from '../../icons/index.js';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  credits: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['split']);
</script>

<template>
  <ul v-if="credits.length" class="artist-identity-credits">
    <li
      v-for="credit in credits"
      :key="credit.id"
      class="artist-identity-credits__item"
    >
      <span class="artist-identity-credits__copy">
        <strong class="artist-identity-credits__name">
          {{ credit.name }}
        </strong>
        <span class="artist-identity-credits__count">
          {{
            t(
              'artist.credits.trackCount',
              { count: credit.trackCount ?? 0 },
              credit.trackCount ?? 0,
            )
          }}
        </span>
      </span>
      <UiIconButton
        v-if="credits.length > 1"
        :icon="ListMinus"
        :label="t('artist.credits.splitNamed', { name: credit.name })"
        tooltip-placement="start"
        :disabled="busy"
        @click="emit('split', credit.id)"
      />
    </li>
  </ul>
  <UiHint v-else padded>{{ t('artist.credits.empty') }}</UiHint>
</template>

<style scoped>
.artist-identity-credits {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.artist-identity-credits__item {
  min-inline-size: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.artist-identity-credits__copy {
  min-inline-size: 0;
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.artist-identity-credits__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.artist-identity-credits__count {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-type-caption-line-height);
  -webkit-user-select: none;
  user-select: none;
}
</style>
