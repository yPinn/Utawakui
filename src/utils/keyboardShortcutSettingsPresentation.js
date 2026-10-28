import { SHORTCUT_COMMANDS } from '../../shared/keyboardShortcutContract.mjs';
import { createKeyboardBindings } from './inputBindingRegistry.js';
import { formatShortcutChord } from './keyboardShortcutPresentation.js';

export const SHORTCUT_CATEGORIES = Object.freeze(
  [
    {
      id: 'playback',
      label: '播放控制',
      guidance: '控制播放、暫停與切歌。',
      commands: ['player.play-pause', 'player.previous', 'player.next'],
    },
    {
      id: 'audio',
      label: '音訊調整',
      guidance: '音量與靜音不影響背景音樂；升降調後需自行儲存。',
      commands: [
        'player.volume-up',
        'player.volume-down',
        'player.mute',
        'player.transpose-up',
        'player.transpose-down',
      ],
    },
    {
      id: 'lyrics',
      label: '歌詞對時',
      guidance: '調整目前歌曲選用的歌詞，會自動儲存。',
      commands: ['lyrics.offset-up', 'lyrics.offset-down'],
    },
    { id: 'reference', label: '操作說明', guidance: '', commands: [] },
  ].map((category) =>
    Object.freeze({ ...category, commands: Object.freeze(category.commands) }),
  ),
);

export const SHORTCUT_USAGE_NOTES = Object.freeze([
  '按功能旁的「設定」，按下想用的按鍵，再按「套用」儲存。「⋯」可停用或恢復該功能的預設鍵。',
  '輸入文字時，快捷鍵不會生效。',
  '操作按鈕、選單或滑桿時，自訂快捷鍵暫不生效；每次按下只執行一次。',
  '方向鍵操作清單、面板或歌詞時，不會同時調整音量。',
  '預設快捷鍵可長按連續操作。',
]);
const titles = {
  'player.volume-up': '音量 +10%',
  'player.volume-down': '音量 −10%',
  'player.mute': '靜音',
  'lyrics.offset-up': '提前 0.1 秒',
  'lyrics.offset-down': '延後 0.1 秒',
};
const descriptions = {
  'player.play-pause': '請先從曲庫載入歌曲。',
  'player.previous': '沒有上一首時，回到這首歌開頭。',
  'player.next': '依目前播放清單或演唱安排切換。',
};
export function shortcutSettingsRows(configuration, categoryId, loaded) {
  const category = SHORTCUT_CATEGORIES.find(({ id }) => id === categoryId);
  const bindings = new Map(
    configuration.bindings.map((binding) => [binding.command, binding.app]),
  );
  return (category?.commands ?? []).map((id) => {
    const command = SHORTCUT_COMMANDS.find((item) => item.id === id),
      app = bindings.get(id);
    const active = loaded && app.mode !== 'disabled';
    const chord = active
      ? app.mode === 'custom'
        ? app.chord
        : command.defaultApp
      : null;
    const status = !loaded
      ? '尚未讀取'
      : app.mode === 'disabled'
        ? '已停用'
        : !chord
          ? '未設定'
          : app.mode === 'custom'
            ? '自訂'
            : '預設';
    const scope =
      app.mode === 'custom'
        ? '輸入文字或操作按鈕、選單、滑桿時不生效；每次按下只執行一次。'
        : chord
          ? (['player.volume-up', 'player.volume-down'].includes(id)
              ? '輸入文字或操作按鈕、選單、面板時不觸發；可長按'
              : '輸入欄位內不觸發；可長按') +
            (command.defaultShiftWildcard ? '，也接受 Shift' : '') +
            '。'
          : '只在主視窗內使用；請先設定按鍵。';
    return {
      ...command,
      app,
      title: titles[id] ?? command.label,
      status,
      keys: chord ? formatShortcutChord(chord).split(' + ') : [],
      guidance: descriptions[id] ?? '',
      scope,
    };
  });
}

const fixedKeys = (binding) => {
  if (binding.key.startsWith('f')) return [binding.key.toUpperCase()];
  if (binding.key.startsWith('browser'))
    return [binding.key === 'browserback' ? 'BrowserBack' : 'BrowserForward'];
  return formatShortcutChord({
    key: binding.key,
    ctrl: binding.ctrl,
    alt: binding.alt,
    shift: binding.shift === true,
  }).split(' + ');
};
const entry = (context, chords, action, note = '') =>
  Object.freeze({ context, chords, action, note });
const pair = (modifier, first, second) => [
  [...modifier, first],
  [...modifier, second],
];
const arrows = [['←'], ['↑'], ['↓'], ['→']];
const fixed = createKeyboardBindings();
export const SHORTCUT_REFERENCE_SECTIONS = Object.freeze([
  {
    id: 'navigation',
    title: '導覽',
    rows: [
      ...fixed
        .filter((binding) => binding.view || binding.history)
        .map((binding) =>
          entry(
            '主視窗',
            [fixedKeys(binding)],
            binding.history
              ? binding.history === 'back'
                ? '上一頁'
                : '下一頁'
              : binding.label,
          ),
        ),
      entry('主視窗', [['F4']], '目前沒有功能'),
    ],
  },
  {
    id: 'practice',
    title: '排練／編輯',
    guidance: '波形操作：歌詞編輯 → 編輯 → 調整對時 → 行旁時鐘 → 原音訊波形。',
    rows: [
      entry(
        '歌曲速度',
        pair(['Ctrl', 'Shift'], '↑', '↓'),
        '加快／放慢 0.05 倍',
      ),
      entry(
        '導唱（直播收音）',
        [['G']],
        '開啟／關閉導唱',
        '不影響你自己聽到的導唱。',
      ),
      entry('OBS 標記', [['K']], '新增標記'),
      entry('波形面板的移動把手', arrows, '移動面板位置'),
      entry(
        '上方全曲波形',
        [['←'], ['↓']],
        '向歌曲開頭移動一頁',
        '只移動畫面，不改播放位置。',
      ),
      entry('上方全曲波形', [['→'], ['↑']], '向歌曲結尾移動一頁'),
      entry(
        '上方全曲波形',
        [['Page Up'], ['Page Down']],
        '向開頭／結尾移動五頁',
      ),
      entry('上方全曲波形', [['Home'], ['End']], '顯示歌曲開頭／結尾'),
      entry('波形面板', [['='], ['-']], '放大／縮小波形', '只調整檢視。'),
      entry(
        '句首／句尾／整句把手',
        [['←'], ['→']],
        '提前／延後 0.1 秒',
        '調整後請按「儲存」。',
      ),
      entry('句首／句尾／整句把手', [['Esc']], '取消目前拖曳'),
      entry('編輯讀音／歌詞來源名稱', [['Enter'], ['Esc']], '確認／取消編輯'),
    ],
  },
  {
    id: 'widgets',
    title: '介面操作',
    rows: [
      entry(
        '面板檢視',
        [['`']],
        '放大面板／還原面板',
        '主工作區、右側與波形面板共用；先點選面板。',
      ),
      entry(
        '面板檢視',
        [['Esc']],
        '還原面板',
        '僅面板放大時；輸入欄與選單優先。',
      ),
      entry('右側面板', [['Esc']], '收合面板'),
      entry(
        '歌曲列',
        [['Space'], ['Enter']],
        '選取歌曲／開啟或播放',
        '依所在清單的操作。',
      ),
      entry('可排序曲目列', [['↑'], ['↓']], '向上／向下移動'),
      entry(
        '滑桿預設值',
        [['ContextMenu'], ['Shift', 'F10']],
        '重設',
        '部分鍵盤或系統可能不支援。',
      ),
      entry('可重排表頭', pair(['Alt'], '←', '→'), '向左／向右移動欄位'),
      entry('欄位邊緣', [['←'], ['→']], '小幅調整欄寬'),
      entry('欄位邊緣', pair(['Shift'], '←', '→'), '大幅調整欄寬'),
      entry('欄位邊緣', [['Home'], ['End']], '最小／最大欄寬'),
      entry('待唱歌曲列', pair(['Alt'], '↑', '↓'), '向上／向下移動'),
      entry('左右面板邊緣', [['Enter'], ['Space']], '展開／收合'),
      entry('左側播放清單邊緣', [['←'], ['Home']], '收合播放清單'),
      entry('左側播放清單邊緣', [['→'], ['End']], '展開播放清單'),
      entry('右側面板／畫面輸出邊緣', [['←'], ['→']], '加寬／減寬面板'),
      entry('右側面板／畫面輸出邊緣', [['Home'], ['End']], '最小／最大寬度'),
      entry('便利貼／照片', arrows, '小幅移動位置'),
      entry(
        '便利貼／照片',
        arrows.map((keys) => ['Shift', ...keys]),
        '大幅移動位置',
      ),
      entry('便利貼／照片', [['Home']], '回到預設位置'),
      entry(
        '照片堆疊',
        [['Enter'], ['Space']],
        '翻動照片',
        '後層翻上一張，前／中層翻下一張。',
      ),
      entry(
        '直接編輯便利貼',
        [['Esc']],
        '結束編輯並保留文字',
        '不會取消修改。',
      ),
      entry('長文閱讀', [['←'], ['Page Up']], '上一頁'),
      entry('長文閱讀', [['→'], ['Page Down']], '下一頁'),
      entry(
        '歌詞捲動區',
        [
          ['↑'],
          ['↓'],
          ['Home'],
          ['End'],
          ['Page Up'],
          ['Page Down'],
          ['Space'],
        ],
        '暫停跟隨目前句',
      ),
    ],
  },
  {
    id: 'system',
    title: '鍵盤媒體鍵',
    rows: [
      entry(
        '鍵盤上的媒體按鍵',
        [['MediaPlayPause'], ['MediaTrackPrevious'], ['MediaTrackNext']],
        '播放／暫停、上一首／下一首',
        '由 Windows 處理，不可在此改鍵。',
      ),
    ],
  },
]);
