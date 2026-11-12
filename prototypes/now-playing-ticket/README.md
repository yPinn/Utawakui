# 票根式 Now Playing 樣張

在專案根目錄啟動預覽。用 480 × 270 的檢視尺寸看票根在畫布中的比例。

```sh
npm exec -- vite --config prototypes/now-playing-ticket/vite.config.js --host 127.0.0.1
```

- `/` 顯示透明畫布與素面副券。
- `/?backdrop=dark`、`/?backdrop=light`、`/?backdrop=checker` 套用既有 Output 檢視背景。
- `/?sample=long` 檢查曲名兩行截斷。 `/?sample=no-cover` 檢查缺封面時的曲名首字。

樣張使用既有 Output 封面、文字與曲目投影。封面取自 [場次月曆樣張](../performance-calendar/README.md)的原創合成舞台照，票根半圓缺口與 Folder 共用。預覽伺服器只為示範曲提供封面。
