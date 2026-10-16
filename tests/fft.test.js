import { describe, it, expect } from 'vitest';
import { fft, nextPow2 } from '../src/lib/fft.js';

describe('fft', () => {
  it('単一周波数の正弦波はそのビンだけに出る', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    fft(re, im);
    expect(re[5]).toBeCloseTo(n / 2, 9);
    expect(re[n - 5]).toBeCloseTo(n / 2, 9);
    for (let k = 0; k < n; k++) if (k !== 5 && k !== n - 5) expect(Math.hypot(re[k], im[k])).toBeLessThan(1e-9);
  });

  it('順変換→逆変換で元に戻る', () => {
    const n = 256;
    const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) + 0.3 * Math.cos(i * 1.9) + (i % 7));
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    fft(re, im, true);
    x.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 9));
  });

  it('2のべき乗でない長さは拒む / nextPow2', () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
    expect(nextPow2(512)).toBe(512);
    expect(nextPow2(513)).toBe(1024);
    expect(nextPow2(30000)).toBe(32768);
  });
});
