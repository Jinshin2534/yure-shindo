// tests/fixtures/jma/ の観測波形で計算した結果(数値だけ)を src/verified.js に書き出す。波形は書き出さない。
import { readFileSync, writeFileSync } from 'node:fs';
import { parseJmaCsv } from '../src/lib/jmaCsv.js';
import { computeIntensity } from '../src/lib/intensity.js';
import { JMA_STATIONS, localName } from '../tests/fixtures/jma-stations.js';

const EVENTS = {
  '1809060307_hokkaido-iburi-tobu': '2018 胆振東部',
  '1604160125_kumamoto': '2016 熊本(本震)',
  '1806180758_osakafu-hokubu': '2018 大阪府北部',
  '1610211407_tottoriken-chubu': '2016 鳥取県中部',
};
const rows = JMA_STATIONS.map((s) => {
  const d = parseJmaCsv(new TextDecoder('shift_jis').decode(readFileSync(new URL(`../tests/fixtures/jma/${localName(s)}`, import.meta.url))));
  const r = computeIntensity(d.comps, d.fs);
  return { name: s.name, event: EVENTS[s.event], official: s.intensity, raw: Number(r.raw.toFixed(4)), ours: r.intensity, match: r.intensity === s.intensity };
});
writeFileSync(
  new URL('../src/verified.js', import.meta.url),
  `// scripts/make-verified.mjs で生成(気象庁の強震観測データで計算した計測震度)\nexport const VERIFIED = ${JSON.stringify(rows, null, 2)};\n`,
);
console.log(rows.filter((r) => r.match).length, '/', rows.length);
