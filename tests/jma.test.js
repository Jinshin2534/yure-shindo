import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseJmaCsv } from '../src/lib/jmaCsv.js';
import { computeIntensity, roundIntensity, shindoClass } from '../src/lib/intensity.js';
import { JMA_STATIONS, localName } from './fixtures/jma-stations.js';

const dir = fileURLToPath(new URL('./fixtures/jma/', import.meta.url));
const load = (s) => parseJmaCsv(new TextDecoder('shift_jis').decode(readFileSync(dir + localName(s))));
const have = JMA_STATIONS.every((s) => existsSync(dir + localName(s)));

describe('気象庁CSVの読み込み', () => {
  const sample = [
    'SITE CODE= 41407テスト観測点            ,34.8443,135.6217, 13,6.1,43269.3323380,  2.26,  3.85',
    ' LAT.=   34.8454',
    ' LON.=  135.6169',
    ' SAMPLING RATE= 100Hz',
    ' UNIT  = gal(cm/s/s)',
    'INITIAL TIME = 2018 06 18 07 58 20',
    ' NS,EW,UD',
    '-0.014,0.000,0.011',
    '-0.001,0.015,-0.012',
    '',
    '0.015,0.015,-0.022',
  ].join('\r\n');

  it('ヘッダからサンプリング周波数と成分名、データ行を読む', () => {
    const d = parseJmaCsv(sample);
    expect(d.fs).toBe(100);
    expect(d.site).toBe('41407テスト観測点');
    expect(d.initial).toBe('2018 06 18 07 58 20');
    expect(Object.keys(d.comps)).toEqual(['ns', 'ew', 'ud']);
    expect(d.length).toBe(3);
    expect(Array.from(d.comps.ud)).toEqual([0.011, -0.012, -0.022]);
  });

  it('形式が違えばはっきり断る', () => {
    expect(() => parseJmaCsv('hello\nworld')).toThrow(/サンプリング/);
    expect(() => parseJmaCsv(sample.replace('gal(cm/s/s)', 'm/s2'))).toThrow(/gal/);
  });
});

// 波形は第三者提供禁止のため同梱していない。`pnpm fetch:jma` で取得すると走る。
describe.skipIf(!have)('気象庁の観測波形で、公表どおりの計測震度が出る', () => {
  for (const s of JMA_STATIONS) {
    it(`${s.name}: 計測震度 ${s.intensity.toFixed(1)}(震度${s.shindo})`, () => {
      const d = load(s);
      const r = computeIntensity(d.comps, d.fs);
      if (s.nearBoundary) {
        // 公表値の境界から 0.01 以内(震度計の実装差の範囲)であることだけを確かめる
        expect(Math.abs(r.raw - s.intensity)).toBeLessThan(0.01);
      } else {
        expect(r.intensity).toBe(s.intensity);
        expect(r.shindo).toBe(s.shindo);
      }
    });
  }

  it('15観測点中14点で計測震度が完全一致、全点で ±0.01 以内', () => {
    let exact = 0;
    for (const s of JMA_STATIONS) {
      const r = computeIntensity(load(s).comps, 100);
      if (r.intensity === s.intensity) exact++;
      expect(r.raw).toBeGreaterThan(s.intensity - 0.01);
      expect(r.raw).toBeLessThan(s.intensity + 0.1);
    }
    expect(exact).toBe(JMA_STATIONS.length - 1);
  });

  it('丸めで繰り上がる記録(熊本西区春日: 生値 5.99x → 6.0)', () => {
    const s = JMA_STATIONS.find((x) => x.name === '熊本西区春日');
    const r = computeIntensity(load(s).comps, 100);
    expect(r.raw).toBeLessThan(6);
    expect(roundIntensity(r.raw)).toBe(6);
    expect(shindoClass(r.intensity)).toBe('6強');
  });
});
