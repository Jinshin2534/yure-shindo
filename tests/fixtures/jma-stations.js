// 気象庁「強震観測データ」に掲載された気象庁観測点(＊なし)の記録と、同ページに載っている計測震度。
// 波形そのものは第三者提供が禁止されているので同梱しない。`pnpm fetch:jma` で各自取得する。
// https://www.data.jma.go.jp/eqev/data/kyoshin/jishin/index.html
export const JMA_BASE = 'https://www.data.jma.go.jp/eqev/data/kyoshin/jishin';

export const JMA_STATIONS = [
  // 2018/09/06 03:07 胆振地方中東部の地震(北海道胆振東部地震)
  { event: '1809060307_hokkaido-iburi-tobu', file: 'acc20180906000147004.csv', name: '厚真町鹿沼', intensity: 6.5, shindo: '7' },
  // 告示どおりに計算すると 5.493(→5.4)。公式は 5.5。境界の 0.007 手前で、震度計の実装差(検定基準 ±0.1)の範囲。
  { event: '1809060307_hokkaido-iburi-tobu', file: 'acc20180906000147487.csv', name: '新千歳空港', intensity: 5.5, shindo: '6弱', nearBoundary: true },
  { event: '1809060307_hokkaido-iburi-tobu', file: 'acc20180906000141101.csv', name: '千歳市北栄', intensity: 5.2, shindo: '5強' },
  // 2016/04/16 01:25 熊本県熊本地方の地震(熊本地震 本震)
  { event: '1604160125_kumamoto', file: 'Q4169CF001.csv', name: '宇城市松橋町', intensity: 6.0, shindo: '6強' },
  { event: '1604160125_kumamoto', file: 'Q416EEB001.csv', name: '熊本西区春日', intensity: 6.0, shindo: '6強' },
  { event: '1604160125_kumamoto', file: 'Q416EED001.csv', name: '南阿蘇村中松', intensity: 5.9, shindo: '6弱' },
  { event: '1604160125_kumamoto', file: 'Q4165E1001.csv', name: '久留米市津福本町', intensity: 5.0, shindo: '5強' },
  // 2018/06/18 07:58 大阪府北部の地震
  { event: '1806180758_osakafu-hokubu', file: 'acc20180618000141407.csv', name: '高槻市桃園町', intensity: 5.4, shindo: '5強' },
  { event: '1806180758_osakafu-hokubu', file: 'acc20180618000141406.csv', name: '箕面市箕面', intensity: 5.3, shindo: '5強' },
  { event: '1806180758_osakafu-hokubu', file: 'acc20180618000141403.csv', name: '宇治市宇治琵琶', intensity: 4.8, shindo: '5弱' },
  { event: '1806180758_osakafu-hokubu', file: 'acc20180618000147771.csv', name: '大阪国際空港', intensity: 4.8, shindo: '5弱' },
  { event: '1806180758_osakafu-hokubu', file: 'acc20180618000141411.csv', name: '西宮市宮前町', intensity: 4.6, shindo: '5弱' },
  { event: '1806180758_osakafu-hokubu', file: 'acc20180618000141404.csv', name: '亀岡市安町', intensity: 4.5, shindo: '5弱' },
  // 2016/10/21 14:07 鳥取県中部の地震
  { event: '1610211407_tottoriken-chubu', file: 'QA21CE41.csv', name: '倉吉市岩倉長峯', intensity: 4.9, shindo: '5弱' },
  { event: '1610211407_tottoriken-chubu', file: 'QA21EA21.csv', name: '鳥取市吉方', intensity: 4.5, shindo: '5弱' },
];

export const localName = (s) => `${s.event}__${s.file}`;
