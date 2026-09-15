<script setup>
import {
  STATUS_COLOR_SWATCHES,
  STATUS_ROLE_SAMPLES,
} from '../../constants/uiDemoPalette';
import { CircleX, Play } from '../../icons/index.js';
</script>

<template>
  <div class="demo-status-palette">
    <p class="demo-review-note">
      <strong>Mildliner 狀態色。</strong>
      色票來源，不是筆觸外觀。主要訊號直接使用原色 100%；Soft
      只作訊息區塊的選用背景。
    </p>
    <div class="demo-status-swatches">
      <figure
        v-for="status in STATUS_COLOR_SWATCHES"
        :key="status.token"
        class="demo-status-swatch"
        :style="{
          '--demo-status-color': `var(${status.token})`,
          '--demo-status-soft': `var(${status.softToken})`,
        }"
      >
        <div class="demo-status-swatch__heading">
          <span class="demo-status-swatch__color" aria-hidden="true" />
          <span class="demo-status-swatch__identity">
            <strong>{{ status.label }}</strong>
            <span>原色 100%</span>
          </span>
        </div>
        <figcaption class="demo-status-swatch__copy">
          <code>{{ status.token }}</code>
          <span>D {{ status.dark }} · L {{ status.light }}</span>
          <span class="demo-status-swatch__soft">Soft 背景（選用）</span>
        </figcaption>
      </figure>
    </div>
    <div class="demo-status-role-review">
      <div class="demo-status-role-review__intro">
        <strong>同色可以，語意不能混用。</strong>
        <span>
          內容類型、格式與來源預設維持 Neutral；只有需要操作員判斷的狀態才使用
          semantic tone。
        </span>
        <span>
          Current 使用 Indigo；Live 與 Danger 保留不同
          token，並以固定形狀與標籤區分。
        </span>
      </div>
      <div
        class="demo-status-roles"
        aria-label="Current、Live 與 Danger 語意界線"
      >
        <article
          v-for="role in STATUS_ROLE_SAMPLES"
          :key="role.key"
          class="demo-status-role"
          :data-signal-role="role.key"
          :style="{ '--demo-signal-color': `var(${role.token})` }"
        >
          <div class="demo-status-role__signal">
            <span
              v-if="role.key === 'current'"
              class="demo-status-role__current"
            >
              <span class="demo-status-role__rail" aria-hidden="true" />
              <Play :size="16" :stroke-width="2" aria-hidden="true" />
              <strong>{{ role.label }}</strong>
            </span>
            <span
              v-else-if="role.key === 'live'"
              class="demo-status-role__live"
            >
              <span class="demo-status-role__dot" aria-hidden="true" />
              <strong>LIVE</strong>
              <span>{{ role.label }}</span>
            </span>
            <span v-else class="demo-status-role__danger">
              <CircleX :size="17" :stroke-width="2" aria-hidden="true" />
              <strong>{{ role.label }}</strong>
            </span>
          </div>
          <code>{{ role.token }}</code>
          <span class="demo-status-role__cue">{{ role.cue }}</span>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-status-palette {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-review-note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-review-note strong {
  color: var(--ui-color-text);
}

.demo-status-swatch__copy code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  overflow-wrap: anywhere;
}

.demo-status-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-status-swatch {
  min-width: 0;
  margin: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-status-swatch__heading {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-status-swatch__color {
  flex: 0 0 auto;
  width: var(--ui-control-height);
  height: var(--ui-control-height);
  border-radius: var(--ui-radius-sm);
  background: var(--demo-status-color);
}

.demo-status-swatch__identity {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.demo-status-swatch__identity > span {
  color: var(--ui-color-text-muted);
}

.demo-status-swatch__copy {
  display: grid;
  gap: var(--ui-space-1);
  margin-top: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.demo-status-swatch__soft {
  width: fit-content;
  margin-top: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--demo-status-soft);
  color: var(--ui-color-text);
}

.demo-status-role-review {
  display: grid;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-status-role-review__intro {
  max-width: 72ch;
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-status-role-review__intro strong {
  color: var(--ui-color-text);
}

.demo-status-roles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-status-role {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-status-role code,
.demo-status-role__cue {
  overflow-wrap: anywhere;
}

.demo-status-role__signal {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
}

.demo-status-role__current,
.demo-status-role__live,
.demo-status-role__danger {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text);
}

.demo-status-role__current {
  color: var(--demo-signal-color);
}

.demo-status-role__rail {
  width: var(--ui-border-width);
  height: calc(var(--ui-control-height) - var(--ui-space-2));
  background: var(--demo-signal-color);
}

.demo-status-role__dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%;
  background: var(--demo-signal-color);
}

.demo-status-role__live strong,
.demo-status-role__danger {
  color: var(--demo-signal-color);
}
</style>
