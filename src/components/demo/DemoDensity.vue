<script setup>
const pair = (standard, compact = standard) => [
  { key: 'standard', label: 'Standard', size: standard },
  { key: 'compact', label: 'Compact', size: compact },
];

const DENSITY_CONTRACTS = Object.freeze([
  {
    label: '一般控制高度',
    token: '--ui-control-height',
    shape: 'square',
    samples: pair('2.25rem', '2rem'),
  },
  {
    label: 'Live 操作下限',
    token: '--ui-control-height-live',
    shape: 'square',
    samples: pair('2.75rem'),
  },
  {
    label: '緊急操作下限',
    token: '--ui-control-height-emergency',
    shape: 'square',
    samples: pair('3rem'),
  },
  {
    label: '曲目列最小高度',
    token: '--ui-track-row-min-height',
    shape: 'height',
    samples: pair('3.25rem', '2.75rem'),
  },
  {
    label: '側欄列最小高度',
    token: '--ui-sidebar-row-min-height',
    shape: 'height',
    samples: pair('3.25rem'),
  },
  {
    label: '曲目封面',
    token: '--ui-track-artwork-size',
    shape: 'square',
    samples: pair('2.5rem', '2.25rem'),
  },
  {
    label: '側欄封面',
    token: '--ui-sidebar-artwork-size',
    shape: 'square',
    samples: pair('2.5rem'),
  },
  {
    label: 'Right Dock 曲目列',
    token: '--ui-right-dock-track-row-min-height',
    shape: 'height',
    samples: pair('3.25rem'),
  },
  {
    label: 'Right Dock 封面',
    token: '--ui-right-dock-track-artwork-size',
    shape: 'square',
    samples: pair('2.5rem'),
  },
  {
    label: '列表標頭',
    token: '--ui-list-header-height',
    shape: 'height',
    samples: pair('2.25rem', '2rem'),
  },
  {
    label: 'Player bar',
    token: '--ui-player-bar-height',
    shape: 'height',
    samples: pair('4.75rem'),
  },
  {
    label: 'Panel inset',
    token: '--ui-panel-inset',
    shape: 'space',
    samples: pair('1rem', '0.75rem'),
  },
  {
    label: 'Side panel 基準邊距',
    token: '--ui-right-dock-content-inset',
    shape: 'space',
    samples: pair('0.5rem'),
  },
  {
    label: 'Shell gutter',
    token: '--ui-shell-gutter',
    shape: 'space',
    samples: pair('0.75rem', '0.5rem'),
  },
]);
</script>

<template>
  <div class="demo-density">
    <p class="demo-density__note">
      視窗化／還原使用 Compact；最大化／全螢幕使用 Standard。只列出目前 active
      token，不另存一份元件或頁面的尺寸狀態。
    </p>

    <div class="demo-density__grid">
      <article
        v-for="contract in DENSITY_CONTRACTS"
        :key="contract.token"
        class="demo-density__item"
        :data-density-token="contract.token"
      >
        <header class="demo-density__header">
          <strong>{{ contract.label }}</strong>
          <code>{{ contract.token }}</code>
        </header>

        <dl class="demo-density__samples">
          <div
            v-for="sample in contract.samples"
            :key="sample.key"
            class="demo-density__sample"
            :data-density-sample="sample.key"
          >
            <dt>{{ sample.label }}</dt>
            <dd>
              <span
                class="demo-density__specimen"
                :data-density-shape="contract.shape"
                :style="{ '--demo-density-size': sample.size }"
                aria-hidden="true"
              />
              <code>{{ sample.size }}</code>
            </dd>
          </div>
        </dl>
      </article>
    </div>
  </div>
</template>

<style scoped>
.demo-density,
.demo-density__grid,
.demo-density__item,
.demo-density__header,
.demo-density__samples {
  min-width: 0;
  display: grid;
}

.demo-density {
  gap: var(--ui-space-4);
}

.demo-density__note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-density__grid {
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-density__item {
  grid-template-rows: auto 1fr;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-density__header {
  gap: var(--ui-space-1);
}

.demo-density__header strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-density__header code,
.demo-density__sample code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-density__samples {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2);
  margin: 0;
}

.demo-density__sample {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-density__sample dt,
.demo-density__sample dd {
  margin: 0;
}

.demo-density__sample dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-density__sample dd {
  min-height: 5.5rem;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
}

.demo-density__specimen {
  display: block;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-accent);
}

.demo-density__specimen[data-density-shape='square'] {
  inline-size: var(--demo-density-size);
  block-size: var(--demo-density-size);
}

.demo-density__specimen[data-density-shape='height'] {
  inline-size: min(100%, 7rem);
  block-size: var(--demo-density-size);
}

.demo-density__specimen[data-density-shape='space'] {
  inline-size: var(--demo-density-size);
  block-size: 2.5rem;
  border: var(--ui-border-width) dashed var(--ui-color-accent);
  background: color-mix(in srgb, var(--ui-color-accent) 18%, transparent);
}

@container (max-width: 28rem) {
  .demo-density__samples {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
