<script setup>
import { shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiPopover from '../ui/UiPopover.vue';
import DemoFieldSurfaceSample from './DemoFieldSurfaceSample.vue';

const dialog = shallowRef('');
const popoverOpen = shallowRef(false);
</script>

<template>
  <section class="demo-field-surfaces" data-field-readonly-review>
    <h4>欄位底色與容器</h4>
    <div class="demo-field-surfaces__actions">
      <UiButton @click="dialog = 'dialog'">Modal</UiButton>
      <UiButton @click="dialog = 'nested'">Modal 內的 Block</UiButton>
      <UiButton @click="dialog = 'document'">文件 Modal</UiButton>
      <UiPopover v-model:open="popoverOpen" aria-label="Popover 欄位">
        <template #trigger="{ triggerProps }">
          <UiButton v-bind="triggerProps" @click="popoverOpen = !popoverOpen">
            Popover
          </UiButton>
        </template>
        <DemoFieldSurfaceSample />
      </UiPopover>
    </div>
    <div class="demo-field-surfaces__comparison">
      <section class="demo-field-surfaces__work-area">
        <h5>工作區</h5>
        <DemoFieldSurfaceSample />
      </section>
      <section
        class="demo-field-surfaces__block"
        data-ui-field-surface="raised"
      >
        <h5>Raised Block</h5>
        <DemoFieldSurfaceSample />
      </section>
    </div>
    <UiModal
      :open="Boolean(dialog)"
      :title="dialog === 'nested' ? 'Modal 內的 Block' : '欄位底色'"
      :presentation="dialog === 'document' ? 'document' : 'dialog'"
      size="wide"
      @close="dialog = ''"
    >
      <div
        v-if="dialog === 'nested'"
        class="demo-field-surfaces__nested"
        data-ui-field-surface="surface"
      >
        <h5>Surface Block</h5>
        <DemoFieldSurfaceSample />
      </div>
      <DemoFieldSurfaceSample v-else />
    </UiModal>
  </section>
</template>

<style scoped>
.demo-field-surfaces {
  display: grid;
  gap: var(--ui-space-3);
}

.demo-field-surfaces__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-field-surfaces__comparison {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-field-surfaces__work-area,
.demo-field-surfaces__block,
.demo-field-surfaces__nested {
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.demo-field-surfaces__block,
.demo-field-surfaces__nested {
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
}

.demo-field-surfaces__block {
  background: var(--ui-color-surface-raised);
}

.demo-field-surfaces__nested {
  background: var(--ui-color-surface);
}
</style>
