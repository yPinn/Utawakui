<script setup>
import { SITE_LINKS } from '../content/links.js';
</script>

<template>
  <article class="privacy texture-paper" aria-labelledby="privacy-title">
    <div class="privacy__content">
      <a href="/">返回首頁</a>
      <header class="privacy__header">
        <h1 id="privacy-title" class="display display--lead">網站隱私說明</h1>
        <p class="type-body">
          這份說明適用於 llazyPilot Studio 的 Utawakui 產品網站。
        </p>
      </header>

      <section aria-labelledby="privacy-visit">
        <h2 id="privacy-visit" class="type-heading">瀏覽網站</h2>
        <p class="type-body">
          瀏覽本站不需要帳號，也沒有資料上傳表單或訪客分析工具。Cloudflare
          提供網站託管，可能會為了傳送網頁、維護安全及排查異常，處理 IP
          位址等連線資訊。
        </p>
      </section>

      <section aria-labelledby="privacy-external">
        <h2 id="privacy-external" class="type-heading">下載與外部連結</h2>
        <p class="type-body">
          安裝檔由 GitHub Releases 提供，社群交流使用
          Discord。開啟外部連結後，該服務依自己的隱私政策處理資料。
        </p>
      </section>

      <section aria-labelledby="privacy-desktop">
        <h2 id="privacy-desktop" class="type-heading">桌面程式</h2>
        <p class="type-body">
          曲庫、歌詞與設定主要保存在你的電腦。更新檢查和選用的線上功能會使用網路，個別功能的用途與資料範圍可在程式內查看。
        </p>
      </section>

      <section aria-labelledby="privacy-contact">
        <h2 id="privacy-contact" class="type-heading">聯絡</h2>
        <p class="type-body">
          如有隱私或安全問題，請使用
          <a :href="SITE_LINKS.security">GitHub 私密回報</a>。
        </p>
      </section>
    </div>
  </article>
</template>

<style scoped>
.privacy {
  min-block-size: 80dvh;
  padding: var(--ui-space-7) 0 var(--ui-space-8);
  background-color: var(--site-ground-canvas);
}

.privacy__content {
  display: grid;
  justify-items: start;
  gap: var(--ui-space-6);
  inline-size: min(42rem, var(--content-width));
  margin-inline: auto;
}

.privacy__header,
.privacy section {
  display: grid;
  gap: var(--ui-space-2);
  justify-items: start;
}
</style>
