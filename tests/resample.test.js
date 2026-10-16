import { describe, it, expect } from 'vitest';
import { resampleUniform, samplingStats } from '../src/lib/resample.js';
import { computeIntensity } from '../src/lib/intensity.js';
import { rng } from '../src/lib/synth.js';

describe('時刻刻みでの再サンプリング', () => {
  it('直線は補間で正確に再現される(順不同の入力も並べ替える)', () => {
    const s = [0, 13, 31, 45, 70, 88, 100].map((t) => ({ t, x: t * 2, y: -t, z: 5 }));
    const u = resampleUniform([...s].reverse(), 100);
    expect(u.x.length).toBe(11);
    u.x.forEach((v, i) => expect(v).toBeCloseTo(i * 20, 9));
    u.y.forEach((v, i) => expect(v).toBeCloseTo(-i * 10, 9));
  });

  it('不規則な受信時刻の正弦波でも、等間隔に直せば計測震度はほぼ同じ', () => {
    const rand = rng(3);
    const f = 2.3;
    const sig = (t) => [8 * Math.sin(2 * Math.PI * f * t), 5 * Math.cos(2 * Math.PI * f * t), 3 * Math.sin(2 * Math.PI * 1.1 * t)];
    // 正解: 100Hz 等間隔
    const n = 2048;
    const ref = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) };
    for (let i = 0; i < n; i++) [ref.x[i], ref.y[i], ref.z[i]] = sig(i / 100);
    // 端末: 平均60Hz・ジッタあり・取りこぼしあり
    const samples = [];
    for (let t = 0; t <= (n / 100) * 1000; t += 16.7 + (rand() - 0.5) * 8) {
      if (rand() < 0.03) continue;
      const [x, y, z] = sig(t / 1000);
      samples.push({ t, x, y, z });
    }
    const u = resampleUniform(samples, 100);
    const a = computeIntensity(ref, 100);
    const b = computeIntensity({ x: u.x.subarray(0, n - 5), y: u.y.subarray(0, n - 5), z: u.z.subarray(0, n - 5) }, 100);
    expect(Math.abs(a.raw - b.raw)).toBeLessThan(0.03);
  });

  it('受信間隔の統計: 実効周波数・ジッタ・取りこぼし', () => {
    const t = [];
    for (let i = 0, x = 0; i < 300; i++) {
      x += i % 50 === 49 ? 33.4 : 16.7;
      t.push({ t: x });
    }
    const st = samplingStats(t);
    expect(st.rate).toBeCloseTo(1000 / 16.7, 1);
    expect(st.gapRatio).toBeCloseTo(6 / 299, 3);
    expect(st.maxGapMs).toBeCloseTo(33.4, 6);
    expect(samplingStats([{ t: 0 }])).toBeNull();
  });

  it('サンプルが足りなければ空', () => {
    expect(resampleUniform([{ t: 0, x: 1, y: 1, z: 1 }], 100).x.length).toBe(0);
  });
});
