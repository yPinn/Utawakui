<script setup>
import trackThumbCropWide from '../../assets/demo/track-thumb/track-thumb-crop-wide.jpg';
import UiPhotoFrame from '../ui/UiPhotoFrame.vue';
</script>

<template>
  <div class="demo-photo-frame-primitive">
    <article data-photo-frame-mode="thumbnail">
      <UiPhotoFrame
        class="demo-photo-frame-primitive__thumbnail"
        :src="trackThumbCropWide"
        alt="照片縮圖裁切範例"
        filtered
      />
      <span>Folder 縮圖 · 4:3 置中裁切</span>
    </article>

    <article data-photo-frame-mode="preview">
      <UiPhotoFrame
        class="demo-photo-frame-primitive__preview"
        :src="trackThumbCropWide"
        alt="照片完整展開範例"
        fit="contain"
        filtered
        intrinsic
      />
      <span>展開預覽 · 保留完整構圖與相同濾鏡</span>
    </article>
  </div>
</template>

<style scoped>
.demo-photo-frame-primitive {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  align-items: start;
  gap: var(--ui-space-4);
}

.demo-photo-frame-primitive article {
  min-inline-size: 0;
  display: grid;
  justify-items: start;
  gap: var(--ui-space-2);
}

.demo-photo-frame-primitive__thumbnail {
  max-inline-size: 17rem;
}

.demo-photo-frame-primitive__preview {
  --ui-media-max-inline-size: 24rem;
  --ui-media-max-block-size: 16rem;
}

.demo-photo-frame-primitive span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
