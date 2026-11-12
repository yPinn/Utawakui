# UI Component Lab

This isolated Vite entry renders the real `src/components/ui/` Vue components
under the production `tokens.css`. It does not connect
to Electron preload, player, queue, library, or filesystem state.

From the repository root:

```powershell
npm exec -- vite --config prototypes/ui-component-lab/vite.config.js
```

Build before capture:

```powershell
npm exec -- vite build --config prototypes/ui-component-lab/vite.config.js
```

The default `.build/` directory is ignored. Build verification may instead use
Vite's `--outDir` option to target a temporary directory.

After a successful build, run the bounded Electron capture and interaction check:

```powershell
node prototypes/capture.cjs ui-component-lab
```

The capture verifies native field label／description contracts, tab-keyboard
behavior, and 200% zoom reflow. It writes seven review fixtures under
`screenshots/`: dark／light default and invalid controls plus dark loading with
reduced motion, disabled, and feedback states.

## Folder 裝飾素材

選「Folder 裝飾素材」，或在 Lab 網址加上 `?tab=stationery&theme=dark`。
用 `theme=light` 看淺色紙面。樣張使用正式 `UiFolderDecoration` 顯示三款郵票、日期郵戳及空白票根。

## 和風直書側欄

啟動 Lab 後選「和風直書側欄」，或在 Lab 網址加上
`?tab=ornate&theme=light`。上方可分別切換側欄位置與頁籤標示。頁籤貼在
內頁邊框內側。預設在右側，面板從右緣向內滑出，頁籤位於面板左緣並
隨面板移動，左側配置則鏡像。滑鼠停留或鍵盤聚焦會顯示圖示名稱。
分類依序為定位、文字、色彩，定位內分為定位基準與位置微調。
拖曳頁籤旁的接線可調整寬度，拉回邊緣會收合。點任一頁籤重新展開；
鍵盤可聚焦接線，用方向鍵調整，或按 Enter 切換。欄位使用本機範例草稿。

若要另存左右 × 圖示／短文字四張截圖，先建置 Lab，再執行：

```powershell
$env:UTAWAKUI_UI_LAB_CAPTURE = 'ornate'
$env:UTAWAKUI_PROTOTYPE_CAPTURE_OUTPUT_DIR = 'tasks/ornate-inspector-captures'
node prototypes/capture.cjs ui-component-lab
```

The shared launcher owns a temporary profile and its exact Electron child tree.
It clears inherited Node-mode startup before launching Electron. Captures update
the checked-in reference images; review those changes separately from source
verification. See the [prototype index](../README.md) for the historical workspace.
