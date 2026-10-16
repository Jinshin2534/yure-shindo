import { describe, it, expect } from 'vitest';
import { createMeter, lostFilterPower, SNR_INTENSITY, toGal } from '../src/lib/meter.js';
import { synthScene, SCENES } from '../src/lib/synth.js';

function run(scene, opts = {}) {
  const m = createMeter();
  let next = 0;
  let peak = -Infinity;
  for (const p of synthScene(scene, { lead: 5, ...opts })) {
    m.push(p.t, p.x, p.y, p.z);
    if (p.t >= next) {
      const st = m.update(p.t);
      if (st.noise && st.live?.ok) peak = Math.max(peak, st.live.raw);
      next += 250;
    }
  }
  m.finish();
  return { ...m.state(), peak };
}

describe('メーター(サンプル → ノイズ床 → 揺れの記録)', () => {
  it('最初の静置でノイズ床を測る', () => {
    const st = run('quiet');
    expect(st.noise).not.toBeNull();
    expect(st.noise.a0).toBeGreaterThan(0.3);
    expect(st.noise.a0).toBeLessThan(1.2);
    expect(st.calibProgress).toBe(1);
  });

  it('静置だけなら揺れは記録しない(ノイズを震度と言わない)', () => {
    expect(run('quiet').events).toHaveLength(0);
  });

  it('ノイズ床すれすれの揺れは「測れない」扱い', () => {
    const st = run('tiptoe');
    expect(st.events).toHaveLength(0);
    expect(st.peak).toBeLessThan(st.noise.raw + SNR_INTENSITY);
  });

  for (const scene of ['door', 'stomp', 'truck']) {
    it(`${SCENES[scene].label}: 1回の揺れとして記録され、ノイズ床 +0.6 以上`, () => {
      const st = run(scene);
      expect(st.events).toHaveLength(1);
      const e = st.events[0];
      expect(e.measurable).toBe(true);
      expect(e.raw).toBeGreaterThanOrEqual(st.noise.raw + SNR_INTENSITY - 1e-9);
      expect(e.intensity).toBeGreaterThan(1);
      expect(e.intensity).toBeLessThan(2.5);
      expect(e.window.x.length).toBeGreaterThan(400);
    });
  }

  it('同じ揺れを強くすると計測震度が上がる(倍で約+0.6)', () => {
    const a = run('door', { noiseGal: 0.05, quantGal: 0 }).events[0].raw;
    const b = run('door', { noiseGal: 0.05, quantGal: 0, gain: 2 }).events[0].raw;
    expect(b - a).toBeCloseTo(0.6, 1);
  });

  it('サンプリング周波数が低いと拾えない帯域が増える', () => {
    expect(lostFilterPower(100)).toBe(0);
    expect(lostFilterPower(60)).toBeLessThan(0.01);
    expect(lostFilterPower(20)).toBeGreaterThan(lostFilterPower(60));
    expect(lostFilterPower(5)).toBeGreaterThan(0.3);
  });

  it('m/s² → gal', () => {
    expect(toGal(9.80665)).toBeCloseTo(980.665, 9);
  });

  it('合成データは種で決まる', () => {
    expect(synthScene('door', { seed: 5 })).toEqual(synthScene('door', { seed: 5 }));
  });
});
