<script setup>
import { computed } from 'vue';
import appIdentity from '../../shared/appIdentity.json';
import UiButton from '../components/ui/UiButton.vue';
import { CircleAlert, ICON_SIZE, Loader2, Smartphone } from '../icons/index.js';
import { t } from '../utils/i18n.js';

const props = defineProps({
  status: { type: String, required: true },
  matchCode: { type: String, default: '' },
  canResume: { type: Boolean, default: false },
});
const emit = defineEmits(['resume']);
const busy = computed(() =>
  ['connecting', 'pairing', 'awaiting-approval'].includes(props.status),
);
const steps = ['network', 'desktop', 'scan'];
</script>

<template>
  <main class="companion-connection">
    <div class="companion-connection__content">
      <header class="companion-connection__brand">
        <img :src="appIdentity.favicon" alt="" />
        <div>
          <h1>{{ appIdentity.productName }}</h1>
          <p>{{ t('companion.title') }}</p>
        </div>
      </header>
      <section
        class="companion-connection__card"
        aria-labelledby="companion-connection-title"
      >
        <div class="companion-connection__message" role="status">
          <h2 id="companion-connection-title">
            <component
              :is="
                busy
                  ? Loader2
                  : status === 'unpaired'
                    ? Smartphone
                    : CircleAlert
              "
              :class="{
                'companion-connection__spinner': busy,
                'companion-connection__attention':
                  !busy && status !== 'unpaired',
              }"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
            {{ t(`companion.setup.states.${status}.title`) }}
          </h2>
          <p>{{ t(`companion.setup.states.${status}.detail`) }}</p>
          <dl
            v-if="status === 'awaiting-approval' && matchCode"
            class="companion-connection__code"
          >
            <dt>{{ t('companion.approval.codeLabel') }}</dt>
            <dd>{{ matchCode }}</dd>
          </dl>
        </div>
        <ol v-if="status === 'unpaired'" class="companion-connection__steps">
          <li v-for="step in steps" :key="step">
            {{ t(`companion.setup.steps.${step}`) }}
          </li>
        </ol>
        <UiButton
          v-if="status === 'displaced' && canResume"
          variant="accent"
          @click="emit('resume')"
        >
          {{ t('companion.page.resume') }}
        </UiButton>
      </section>
    </div>
  </main>
</template>

<style scoped>
.companion-connection {
  display: grid;
  align-content: safe center;
  justify-items: center;
  min-block-size: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--ui-space-3);
  padding-block-start: max(var(--ui-space-3), env(safe-area-inset-top, 0px));
  padding-block-end: max(var(--ui-space-3), env(safe-area-inset-bottom, 0px));
  background: var(--ui-companion-canvas);
}

.companion-connection__content {
  display: grid;
  gap: var(--ui-space-3);
  inline-size: min(100%, var(--ui-companion-connection-max-inline-size));
}

.companion-connection__brand {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.companion-connection__brand img {
  inline-size: var(--ui-artwork-size-md);
  block-size: var(--ui-artwork-size-md);
  object-fit: contain;
}

.companion-connection__brand h1 {
  font-size: var(--ui-type-display-size);
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
}

.companion-connection__brand p,
.companion-connection__code dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.companion-connection__card {
  display: grid;
  justify-items: start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-companion-panel);
}

.companion-connection__message {
  display: grid;
  gap: var(--ui-space-2);
  inline-size: 100%;
}

.companion-connection__message h2 {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.companion-connection__message h2 svg {
  flex: none;
  color: var(--ui-color-accent);
}

.companion-connection__message h2 .companion-connection__attention {
  color: var(--ui-color-warning);
}

.companion-connection__message p,
.companion-connection__steps {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.companion-connection__steps {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding-inline-start: var(--ui-space-5);
}

.companion-connection__steps li::marker {
  color: var(--ui-color-accent);
  font-weight: var(--ui-font-weight-semibold);
}

.companion-connection__code {
  display: grid;
  justify-items: center;
  gap: var(--ui-space-1);
  margin: var(--ui-space-2) 0 0;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: var(--ui-companion-canvas);
}

.companion-connection__code dd {
  margin: 0;
  font-size: var(--ui-type-display-size);
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--ui-companion-match-code-letter-spacing);
  padding-inline-start: var(--ui-companion-match-code-letter-spacing);
}

@media (prefers-reduced-motion: no-preference) {
  .companion-connection__spinner {
    animation: companion-connection-spin var(--ui-motion-duration-spin) linear
      infinite;
  }
}

@keyframes companion-connection-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (max-height: 24rem) {
  .companion-connection__brand img {
    inline-size: var(--ui-artwork-size-sm);
    block-size: var(--ui-artwork-size-sm);
  }
}
</style>
