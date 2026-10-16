import { describe, it, expect } from 'vitest';
import {
  periodGain, highCutGain, lowCutGain, jmaFilterGain, applyJmaFilter,
  findA0, rawIntensity, roundIntensity, shindoClass, computeIntensity,
} from '../src/lib/intensity.js';

const FS = 100;
const circle = (amp, f, sec) => {
  const n = sec * FS;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = amp * Math.cos((2 * Math.PI * f * i) / FS);
    y[i] = amp * Math.sin((2 * Math.PI * f * i) / FS);
  }
  return { x, y, z: new Float64Array(n) };
};

describe('3つのフィルタ(告示の式)', () => {
  it('周期効果 √(1/f)', () => {
    expect(periodGain(1)).toBe(1);
    expect(periodGain(4)).toBeCloseTo(0.5, 12);
  });
  it('ハイカット: f=10Hz(X=1)で係数の和', () => {
    const sum = 1 + 0.694 + 0.241 + 0.0557 + 0.009664 + 0.00134 + 0.000155;
    expect(highCutGain(10)).toBeCloseTo(1 / Math.sqrt(sum), 12);
    expect(highCutGain(0)).toBe(1);
  });
  it('ローカット: f=0.5Hzで √(1-e^-1)、低いほど落ちる', () => {
    expect(lowCutGain(0.5)).toBeCloseTo(Math.sqrt(1 - Math.exp(-1)), 12);
    expect(lowCutGain(0.1)).toBeLessThan(0.1);
    expect(lowCutGain(5)).toBeCloseTo(1, 9);
  });
  it('合成ゲインは 0Hz で0、1〜2Hz付近で大きく、高周波で小さい', () => {
    expect(jmaFilterGain(0)).toBe(0);
    expect(jmaFilterGain(1)).toBeGreaterThan(jmaFilterGain(10));
    expect(jmaFilterGain(1)).toBeGreaterThan(jmaFilterGain(0.2));
    expect(jmaFilterGain(30)).toBeLessThan(0.02);
  });
  it('FFTフィルタ: 正弦波の振幅がゲインどおりに変わる', () => {
    const n = 1024;
    // FFTのビンにちょうど乗る周波数(約1.95Hz)で確かめる
    const fb = (20 * FS) / n;
    const xb = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * fb * i) / FS));
    const yb = applyJmaFilter(xb, FS);
    const peak = Math.max(...yb.slice(100, 900).map(Math.abs));
    expect(peak).toBeCloseTo(jmaFilterGain(fb), 6);
    expect(yb.length).toBe(n);
  });
});

describe('0.3秒ルールと計測震度', () => {
  it('合成値の上位 0.3秒ぶん(100Hzで30点)目が a0', () => {
    const mag = new Float64Array(1000).fill(1);
    for (let i = 0; i < 30; i++) mag[100 + i * 7] = 10 + i;
    expect(findA0(mag, FS)).toBe(10);
    mag[999] = 50; // 31点目が加わると、30番目は 11 になる
    expect(findA0(mag, FS)).toBe(11);
    expect(findA0(new Float64Array(10), FS)).toBeNull();
  });

  it('I = 2 log10(a0) + 0.94', () => {
    expect(rawIntensity(1)).toBeCloseTo(0.94, 12);
    expect(rawIntensity(100)).toBeCloseTo(4.94, 12);
  });

  it('丸め: 小数第3位を四捨五入してから第2位以下を切り捨て', () => {
    expect(roundIntensity(5.9988)).toBe(6.0); // 熊本西区春日(2016)で実際に効く
    expect(roundIntensity(5.493)).toBe(5.4);
    expect(roundIntensity(5.449)).toBe(5.4);
    expect(roundIntensity(5.495)).toBe(5.5);
    expect(roundIntensity(4.5)).toBe(4.5);
    expect(roundIntensity(0.94)).toBe(0.9);
  });

  it('震度階級の境界', () => {
    const cases = [[0.4, '0'], [0.5, '1'], [1.4, '1'], [1.5, '2'], [3.5, '4'], [4.4, '4'], [4.5, '5弱'], [4.9, '5弱'],
      [5.0, '5強'], [5.5, '6弱'], [6.0, '6強'], [6.4, '6強'], [6.5, '7'], [7.2, '7'], [-1, '0']];
    for (const [i, c] of cases) expect(shindoClass(i)).toBe(c);
  });

  it('円運動(合成値が一定)なら a0 = 振幅 × フィルタゲイン で解析解と一致', () => {
    const f = 1.5625; // 4096点のビンに乗る(100Hz × 64/4096)
    const amp = 50;
    const r = computeIntensity(circle(amp, f, 40.96), FS);
    expect(r.ok).toBe(true);
    expect(r.a0).toBeCloseTo(amp * jmaFilterGain(f), 6);
    expect(r.raw).toBeCloseTo(2 * Math.log10(amp * jmaFilterGain(f)) + 0.94, 6);
  });

  it('振幅を2倍にすると計測震度は 2log10(2) ≈ 0.602 上がる', () => {
    const a = computeIntensity(circle(10, 1.5625, 40.96), FS);
    const b = computeIntensity(circle(20, 1.5625, 40.96), FS);
    expect(b.raw - a.raw).toBeCloseTo(2 * Math.log10(2), 9);
  });

  it('向きに依存しない: 軸を入れ替え・回転しても同じ値', () => {
    const c = circle(30, 3.125, 20.48);
    const a = computeIntensity(c, FS);
    const th = 0.7;
    const rot = {
      x: c.x.map((v, i) => Math.cos(th) * v - Math.sin(th) * c.z[i]),
      y: c.y,
      z: c.x.map((v, i) => Math.sin(th) * v + Math.cos(th) * c.z[i]),
    };
    expect(computeIntensity(rot, FS).raw).toBeCloseTo(a.raw, 9);
    expect(computeIntensity({ a: c.z, b: c.x, c: c.y }, FS).raw).toBeCloseTo(a.raw, 9);
  });

  it('一定の傾き(重力のDC)は結果に影響しない', () => {
    const c = circle(5, 3.125, 20.48);
    const a = computeIntensity(c, FS);
    const g = computeIntensity({ x: c.x.map((v) => v + 120), y: c.y, z: c.z.map((v) => v + 972) }, FS);
    expect(g.raw).toBeCloseTo(a.raw, 9);
  });

  it('3成分そろっていないと拒む / 短すぎると ok:false', () => {
    expect(() => computeIntensity({ x: new Float64Array(10) }, FS)).toThrow();
    const r = computeIntensity({ x: new Float64Array(20), y: new Float64Array(20), z: new Float64Array(20) }, FS);
    expect(r.ok).toBe(false);
  });
});
