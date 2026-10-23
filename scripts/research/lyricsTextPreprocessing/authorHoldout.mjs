// Synthetic authoring only. Deliberately imports no candidate generator or model.
import fs from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';

const destination = 'docs/research/lyrics-text-holdout';
fs.mkdirSync(destination, { recursive: true });
if (fs.existsSync(`${destination}/inputs-2026-10-23.json`))
  throw Error('authored-manifest-already-exists');
const inputs = [],
  answers = [];
const add = (language, key, pieces, choices, forbidden = [], options = {}) => {
  const text = pieces.join('');
  const lineId = randomBytes(8).toString('hex');
  const references = choices.map((cuts) => {
    const parts = [];
    let part = '';
    pieces.forEach((piece, i) => {
      part += piece;
      if (cuts.includes(i + 1) || i === pieces.length - 1) {
        parts.push(part);
        part = '';
      }
    });
    return parts;
  });
  const forbiddenSpans = forbidden.map(([phrase, reason]) => {
    const start = text.indexOf(phrase);
    if (start < 0) throw Error(`missing-authored-span:${key}:${phrase}`);
    return { start, end: start + phrase.length, text: phrase, reason };
  });
  inputs.push({
    lineId,
    language,
    text,
    source: {
      documentId: randomBytes(8).toString('hex'),
      startMs: 12000,
      endMs: 20000,
    },
  });
  answers.push({
    lineId,
    caseId: `${language}-${key}`,
    language,
    primary: key.startsWith('K') ? 'classification' : 'split',
    family: `${language}-${key.startsWith('M1') ? 'M1' : key.startsWith('K7') ? 'K7' : key}`,
    referencePartitions: references,
    forbiddenSpans,
    annotationStatus: 'agent-authored-unreviewed',
    ...options,
  });
};
const m1 = (language, clauses, joins) =>
  joins.forEach((join, i) =>
    add(
      language,
      `M1${'abc'[i]}`,
      clauses.map((s, n) => s + (n < clauses.length - 1 ? join : '')),
      [[1], [2], [1, 2]],
      [],
      {
        semanticUnits: clauses,
        whitespaceVariant: i,
        joint: i === 0,
        timeControl: i === 0,
      },
    ),
  );
const split = (
  language,
  key,
  pieces,
  choices = [[1], [1, 2]],
  forbidden = [],
  options = {},
) => add(language, key, pieces, choices, forbidden, options);
const credit = (
  language,
  key,
  text,
  expectedKind,
  options = {},
  pieces = [text],
  choices = [[]],
  forbidden = [],
) =>
  add(language, key, pieces, choices, forbidden, { expectedKind, ...options });

m1(
  'zh-Hant',
  ['抽屜裡的明信片還沒寄出', '你在屋頂替盆栽擋雨', '我推開門說今天不用趕路'],
  [' ', '　\t  ', ''],
);
split(
  'zh-Hant',
  'M2',
  [
    '鐘樓響了三下，',
    '市場收起遮陽棚；',
    '孩子抱著紙船跑回來，',
    '我們把晚餐移到騎樓。',
  ],
  [
    [1, 2, 3],
    [1, 3],
    [2, 3],
  ],
  [],
  { timeControl: true },
);
split(
  'zh-Hant',
  'N1',
  ['我一直珍藏著那枚由你在搬家前親手縫進舊外套內袋的小小木扣子'],
  [[]],
  [['親手縫進舊外套內袋', 'dependency']],
  { timeControl: true },
);
split('zh-Hant', 'N2', ['OH OH 再一次再一次'], [[]]);
split(
  'zh-Hant',
  'D1',
  ['[甲] 先把燈留給晚歸的人 ', '[乙] 我會守著這扇門直到你回來'],
  [[1]],
  [
    ['[甲] 先把', 'role'],
    ['[乙] 我會', 'role'],
  ],
);
split(
  'zh-Hant',
  'D2',
  ['等收音機播完這首老歌，', 'we can start again，', '不用急著回答我。'],
  [[1], [2], [1, 2]],
);
split(
  'zh-Hant',
  'H1',
  ['我把空椅留在身旁（和聲：等你啊等你），', '等門鈴喚醒安靜的走廊。'],
  [[1], []],
  [['（和聲：等你啊等你）', 'harmony']],
  { joint: true, timeControl: true },
);
split(
  'zh-Hant',
  'A1',
  ['當你終於找到那把備用鑰匙的時候，', '記得替我打開門口的小燈。'],
  [[1]],
  [['找到那把備用鑰匙的時候', 'dependency']],
);
split(
  'zh-Hant',
  'A2',
  ['我捨不得把還沒寫完的便條丟掉，', '只好再替它找一個抽屜。'],
  [[1]],
  [['把還沒寫完的便條丟掉', 'dependency']],
);
split(
  'zh-Hant',
  'Q1',
  ['你把「編曲：未完成的夏天」唱了兩遍，', '我才發現那也是我們的暗號。'],
  [[1]],
  [['「編曲：未完成的夏天」', 'quotation']],
);
credit('zh-Hant', 'K1', '作曲：林岸', 'credit-candidate');
credit('zh-Hant', 'K2', '【編曲 許岑】', 'credit-candidate');
credit(
  'zh-Hant',
  'K3',
  '[小青] 把窗打開 [阿朗] 我聽見你了',
  'lyric',
  { joint: true },
  ['[小青] 把窗打開 ', '[阿朗] 我聽見你了'],
  [[1]],
  [
    ['[小青] 把窗', 'role'],
    ['[阿朗] 我聽見', 'role'],
  ],
);
credit('zh-Hant', 'K4', '和聲：啊啊（一起唱，別停下）', 'lyric');
credit(
  'zh-Hant',
  'K5',
  '她唱著「作詞：回家的人」，尾音還繞在樓梯間。',
  'lyric',
);
credit(
  'zh-Hant',
  'K6',
  '作詞：江雨 / 今夜請把我的名字唱進燈火裡',
  'ambiguous',
  { joint: true, mixed: true },
  ['作詞：江雨 / ', '今夜請把我的名字唱進燈火裡'],
  [[1]],
);
credit('zh-Hant', 'K7a', '編曲：沉默', 'unresolvable', {
  pair: 'zh-Hant-identical',
  hiddenIntent: 'attribution',
});
credit('zh-Hant', 'K7b', '編曲：沉默', 'unresolvable', {
  pair: 'zh-Hant-identical',
  hiddenIntent: 'performed',
});

m1(
  'zh-Hans',
  ['院子里的葡萄已经熟了', '外婆把竹椅搬到树下', '我端着茶等她讲完故事'],
  [' ', '  \t　', ''],
);
split(
  'zh-Hans',
  'M2',
  [
    '渡口升起第一面旗，',
    '修船的人卷起衣袖；',
    '有人喊了一声开饭，',
    '我们沿着小路走向炊烟。',
  ],
  [
    [1, 2, 3],
    [1, 3],
    [2, 3],
  ],
  [],
  { timeControl: true },
);
split(
  'zh-Hans',
  'N1',
  ['你送给我的那本夹着干花和旧电影票的蓝色笔记本一直放在最上层的书架上'],
  [[]],
  [['夹着干花和旧电影票的蓝色笔记本', 'dependency']],
  { timeControl: true },
);
split('zh-Hans', 'N2', ['HEY HEY 还要唱还要唱'], [[]]);
split(
  'zh-Hans',
  'D1',
  ['[姐姐] 你先坐下来歇一会儿 ', '[弟弟] 等我把桌上的拼图拼完'],
  [[1]],
  [
    ['[姐姐] 你先', 'role'],
    ['[弟弟] 等我', 'role'],
  ],
);
split(
  'zh-Hans',
  'D2',
  ['把风筝交给我，', 'take your time，', '我们还赶得上日落。'],
  [[1], [2], [1, 2]],
);
split(
  'zh-Hans',
  'H1',
  ['我会沿着你画的箭头前行（合唱：向前向前），', '直到山谷里传来回答。'],
  [[1], []],
  [['（合唱：向前向前）', 'harmony']],
  { joint: true, timeControl: true },
);
split(
  'zh-Hans',
  'A1',
  ['在你把所有没说出口的愿望写进信封之后，', '我们再一起去敲那扇门。'],
  [[1]],
  [['所有没说出口的愿望', 'dependency']],
);
split(
  'zh-Hans',
  'A2',
  ['我始终舍不得让刚学会飞翔的纸鹤停在原地，', '于是又轻轻推开窗。'],
  [[1]],
  [['让刚学会飞翔的纸鹤停在原地', 'dependency']],
);
split(
  'zh-Hans',
  'Q1',
  ['你笑着念出“作曲：会发光的石头”，', '小河也跟着哼了起来。'],
  [[1]],
  [['“作曲：会发光的石头”', 'quotation']],
);
credit('zh-Hans', 'K1', '作词：赵禾', 'credit-candidate');
credit('zh-Hans', 'K2', '【作曲 周苇】', 'credit-candidate');
credit(
  'zh-Hans',
  'K3',
  '[阿宁] 让我先说 [小满] 我一直在听',
  'lyric',
  { joint: true },
  ['[阿宁] 让我先说 ', '[小满] 我一直在听'],
  [[1]],
  [
    ['[阿宁] 让我', 'role'],
    ['[小满] 我一直', 'role'],
  ],
);
credit('zh-Hans', 'K4', '合唱：啦啦啦（别停，跟着我）', 'lyric');
credit('zh-Hans', 'K5', '我把“编曲：等花开”当成歌词唱给你听。', 'lyric');
credit(
  'zh-Hans',
  'K6',
  '作曲：宋川 / 请把这盏灯带到山的那一边',
  'ambiguous',
  { joint: true, mixed: true },
  ['作曲：宋川 / ', '请把这盏灯带到山的那一边'],
  [[1]],
);
credit('zh-Hans', 'K7a', '作词：告别', 'unresolvable', {
  pair: 'zh-Hans-identical',
  hiddenIntent: 'attribution',
});
credit('zh-Hans', 'K7b', '作词：告别', 'unresolvable', {
  pair: 'zh-Hans-identical',
  hiddenIntent: 'performed',
});

m1(
  'en',
  [
    'The bakery opens before sunrise',
    'you save the broken chair beside the door',
    'I bring a cup for anyone who stays',
  ],
  [' ', '   \t ', ' '],
);
split(
  'en',
  'M2',
  [
    'The ferry sounds its horn; ',
    'a gull drops from the rail; ',
    'you wave your scarf above the crowd; ',
    'I lift the suitcase with the missing wheel.',
  ],
  [
    [1, 2, 3],
    [1, 3],
    [2, 3],
  ],
  [],
  { timeControl: true },
);
split(
  'en',
  'N1',
  [
    'I still wear the slightly oversized yellow sweater that your little brother knitted for my first winter away from home',
  ],
  [[]],
  [['your little brother', 'dependency']],
  { timeControl: true },
);
split('en', 'N2', ['OH OH STAY STAY e\u0301🌙'], [[]]);
split(
  'en',
  'D1',
  [
    '[June] Keep a little room for me at the table ',
    '[Robin] I have kept your place through every season',
  ],
  [[1]],
  [
    ['[June] Keep', 'role'],
    ['[Robin] I have', 'role'],
  ],
);
split(
  'en',
  'D2',
  [
    'Fold the map along the river, ',
    'もう迷わないよ, ',
    'we can ask the moon for directions.',
  ],
  [[1], [2], [1, 2]],
);
split(
  'en',
  'H1',
  [
    'I will carry the melody (choir: carry it softly), ',
    'while you find the words you meant to say.',
  ],
  [[1], []],
  [['(choir: carry it softly)', 'harmony']],
  { joint: true, timeControl: true },
);
split(
  'en',
  'A1',
  [
    'When the person who borrowed your umbrella returns, ',
    'leave a clean towel by the kitchen door.',
  ],
  [[1]],
  [['who borrowed your umbrella', 'dependency']],
);
split(
  'en',
  'A2',
  [
    "I don't want to give up the promise we made, ",
    'even if the letters on the wall begin to fade.',
  ],
  [[1]],
  [
    ["don't", 'dependency'],
    ['give up', 'dependency'],
  ],
);
split(
  'en',
  'Q1',
  [
    'She sings "Written by the city that forgot us", ',
    'and the empty platform answers in a whisper.',
  ],
  [[1]],
  [['"Written by the city that forgot us"', 'quotation']],
);
credit('en', 'K1', 'Music by Mira Vale', 'credit-candidate');
credit('en', 'K2', '【Arranged by Rowan Lake】', 'credit-candidate');
credit(
  'en',
  'K3',
  '[Nora] Pass me the tune [Eli] I will take the next verse',
  'lyric',
  { joint: true },
  ['[Nora] Pass me the tune ', '[Eli] I will take the next verse'],
  [[1]],
  [
    ['[Nora] Pass', 'role'],
    ['[Eli] I will', 'role'],
  ],
);
credit('en', 'K4', 'Backing vocals: oh oh (all together now)', 'lyric');
credit(
  'en',
  'K5',
  'You sang “Music by the rain” until the kettle answered.',
  'lyric',
);
credit(
  'en',
  'K6',
  'Lyrics by Wren Hall / Keep your hands above the water',
  'ambiguous',
  { joint: true, mixed: true },
  ['Lyrics by Wren Hall / ', 'Keep your hands above the water'],
  [[1]],
);
credit('en', 'K7a', 'Written by Nobody', 'unresolvable', {
  pair: 'en-identical',
  hiddenIntent: 'attribution',
});
credit('en', 'K7b', 'Written by Nobody', 'unresolvable', {
  pair: 'en-identical',
  hiddenIntent: 'performed',
});

m1(
  'ja',
  [
    '坂のパン屋が窓を開けた',
    '向かいの猫があくびをした',
    '僕は昨日の手紙をポケットにしまった',
  ],
  [' ', '　\t　', ''],
);
split(
  'ja',
  'M2',
  [
    '祭りの太鼓が止んだら、',
    '屋台の明かりを数えよう；',
    '金魚の袋を揺らさずに、',
    '遠回りして家まで帰ろう。',
  ],
  [
    [1, 2, 3],
    [1, 3],
    [2, 3],
  ],
  [],
  { timeControl: true },
);
split(
  'ja',
  'N1',
  [
    '君が引っ越す前の日に忘れていった少し欠けた青いマグカップを今でも大切に使っている',
  ],
  [[]],
  [['大切に使っている', 'dependency']],
  { timeControl: true },
);
split('ja', 'N2', ['ラララ もう一度もう一度'], [[]]);
split(
  'ja',
  'D1',
  ['[紬] 先に橋を渡って待っていて ', '[蓮] 君の足音がするまでここにいる'],
  [[1]],
  [
    ['[紬] 先に', 'role'],
    ['[蓮] 君の', 'role'],
  ],
);
split(
  'ja',
  'D2',
  ['傘をたたんで、', 'hold my hand、', '水たまりを飛び越えよう。'],
  [[1], [2], [1, 2]],
);
split(
  'ja',
  'H1',
  [
    '声がかすれても歌い続ける（コーラス：まだ歌える）、',
    '君が次の言葉を思い出すまで。',
  ],
  [[1], []],
  [['（コーラス：まだ歌える）', 'harmony']],
  { joint: true, timeControl: true },
);
split(
  'ja',
  'A1',
  ['駅の本棚で君の名前を見つけたとき、', '忘れていた約束を思い出した。'],
  [[1]],
  [['見つけたとき', 'dependency']],
);
split(
  'ja',
  'A2',
  [
    '帰らないでと小さな声でつぶやいてしまったけれど、',
    '返事はまだ聞かずにいる。',
  ],
  [[1]],
  [
    ['帰らないでと', 'dependency'],
    ['つぶやいてしまった', 'dependency'],
  ],
);
split(
  'ja',
  'Q1',
  [
    '君が「作詞：ほどけた靴ひも」と歌うたびに、',
    '僕は歩く速さを少しだけ落とす。',
  ],
  [[1]],
  [['「作詞：ほどけた靴ひも」', 'quotation']],
);
credit('ja', 'K1', '作詞：水瀬ゆう', 'credit-candidate');
credit('ja', 'K2', '【編曲 星野あき】', 'credit-candidate');
credit(
  'ja',
  'K3',
  '[澪] ここから歌うよ [律] 次は僕の番だね',
  'lyric',
  { joint: true },
  ['[澪] ここから歌うよ ', '[律] 次は僕の番だね'],
  [[1]],
  [
    ['[澪] ここから', 'role'],
    ['[律] 次は', 'role'],
  ],
);
credit('ja', 'K4', 'コーラス：ラララ（みんなでもう一度）', 'lyric');
credit('ja', 'K5', '「編曲：眠れない街」と君が歌って笑った。', 'lyric');
credit(
  'ja',
  'K6',
  '作曲：朝比奈そら / 今夜は窓を閉めずに待っていて',
  'ambiguous',
  { joint: true, mixed: true },
  ['作曲：朝比奈そら / ', '今夜は窓を閉めずに待っていて'],
  [[1]],
);
credit('ja', 'K7a', '作詞：さよなら', 'unresolvable', {
  pair: 'ja-identical',
  hiddenIntent: 'attribution',
});
credit('ja', 'K7b', '作詞：さよなら', 'unresolvable', {
  pair: 'ja-identical',
  hiddenIntent: 'performed',
});

m1(
  'ko',
  [
    '우체통에 파란 편지가 도착했어',
    '너는 마당의 작은 의자를 닦았지',
    '나는 대답 대신 찻잔 두 개를 꺼냈어',
  ],
  [' ', '　 \t ', ' '],
);
split(
  'ko',
  'M2',
  [
    '운동장의 불이 꺼지면, ',
    '마지막 공을 주워 담자; ',
    '네가 신발 끈을 묶는 동안, ',
    '나는 열린 문을 잡고 있을게.',
  ],
  [
    [1, 2, 3],
    [1, 3],
    [2, 3],
  ],
  [],
  { timeControl: true },
);
split(
  'ko',
  'N1',
  [
    '네가 처음 뜨개질을 배워서 내게 선물했던 조금 삐뚤어진 초록 목도리를 아직도 아껴 두고 있어',
  ],
  [[]],
  [['아껴 두고 있어', 'dependency']],
  { timeControl: true },
);
split('ko', 'N2', ['오 오 다시 다시 가🌙'], [[]]);
split(
  'ko',
  'D1',
  ['[하린] 먼저 네 이야기를 들려줘 ', '[도윤] 끝까지 내 옆에 앉아 있어 줘'],
  [[1]],
  [
    ['[하린] 먼저', 'role'],
    ['[도윤] 끝까지', 'role'],
  ],
);
split(
  'ko',
  'D2',
  [
    '창가에 기대어 노래해, ',
    'stay a little longer, ',
    '아직 끝내지 못한 이야기가 있어.',
  ],
  [[1], [2], [1, 2]],
);
split(
  'ko',
  'H1',
  [
    '작은 목소리라도 너에게 보낼게 (화음: 들리니 들리니), ',
    '대답이 올 때까지 이 멜로디를 지킬게.',
  ],
  [[1], []],
  [['(화음: 들리니 들리니)', 'harmony']],
  { joint: true, timeControl: true },
);
split(
  'ko',
  'A1',
  ['책장 사이에 끼워 둔 사진을 찾았을 때, ', '그날 네가 하던 말을 떠올렸어.'],
  [[1]],
  [['찾았을 때', 'dependency']],
);
split(
  'ko',
  'A2',
  [
    '다시는 놓치지 않겠다고 혼자 약속해 버렸지만, ',
    '아직 네 앞에서는 말하지 못했어.',
  ],
  [[1]],
  [
    ['않겠다고', 'dependency'],
    ['약속해 버렸지만', 'dependency'],
  ],
);
split(
  'ko',
  'Q1',
  [
    '네가 “작사: 접어 둔 지도”라고 노래하면, ',
    '나는 아무 말 없이 다음 소절을 기다려.',
  ],
  [[1]],
  [['“작사: 접어 둔 지도”', 'quotation']],
);
credit('ko', 'K1', '작곡: 서하늘', 'credit-candidate');
credit('ko', 'K2', '【편곡 윤가람】', 'credit-candidate');
credit(
  'ko',
  'K3',
  '[소연] 내 노래를 받아 줘 [지호] 다음 구절은 내가 부를게',
  'lyric',
  { joint: true },
  ['[소연] 내 노래를 받아 줘 ', '[지호] 다음 구절은 내가 부를게'],
  [[1]],
  [
    ['[소연] 내 노래를', 'role'],
    ['[지호] 다음 구절은', 'role'],
  ],
);
credit('ko', 'K4', '화음: 아아아 (함께 다시 불러)', 'lyric');
credit('ko', 'K5', '너는 “편곡: 빈 의자”라는 말을 가사처럼 불렀어.', 'lyric');
credit(
  'ko',
  'K6',
  '작사: 한여울 / 오늘은 이 길의 끝까지 함께 걸어 줘',
  'ambiguous',
  { joint: true, mixed: true },
  ['작사: 한여울 / ', '오늘은 이 길의 끝까지 함께 걸어 줘'],
  [[1]],
);
credit('ko', 'K7a', '작곡: 기다림', 'unresolvable', {
  pair: 'ko-identical',
  hiddenIntent: 'attribution',
});
credit('ko', 'K7b', '작곡: 기다림', 'unresolvable', {
  pair: 'ko-identical',
  hiddenIntent: 'performed',
});

// Inputs and authored answers are fixed before any candidate inspection.
const write = (name, value) =>
  fs.writeFileSync(
    `${destination}/${name}-2026-10-23.json`,
    JSON.stringify(value, null, 2) + '\n',
  );
write('inputs', {
  scope: 'New agent-authored synthetic holdout; no native-speaker review',
  cases: inputs,
});
write('answers', {
  annotation: 'agent-authored-unreviewed',
  nativeReview: 'pending',
  cases: answers,
});
write('time-controls', {
  scope:
    'Evaluator-only alternate fixtures; reuse textual results, no model rerun',
  cases: answers
    .filter((a) => a.timeControl)
    .map((a) => ({
      lineId: a.lineId,
      original: inputs.find((i) => i.lineId === a.lineId).source,
      alternate: { startMs: 12000, endMs: 44000 },
      vocalBoundary: 'unknown',
    })),
});
const sha = (p) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(
  'tasks/lyrics-text-holdout-20261023/authored-lock.json',
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      scope: 'Locked before candidate generation or inference',
      hashes: Object.fromEntries(
        ['inputs', 'answers', 'time-controls'].map((n) => [
          `${destination}/${n}-2026-10-23.json`,
          sha(`${destination}/${n}-2026-10-23.json`),
        ]),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    inputs: inputs.length,
    answers: answers.length,
    primarySplit: answers.filter((a) => a.primary === 'split').length,
    joint: answers.filter((a) => a.joint).length,
    timeControls: answers.filter((a) => a.timeControl).length,
  }),
);
