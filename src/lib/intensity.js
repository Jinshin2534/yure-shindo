// 気象庁の計測震度の算出方法(平成8年 気象庁告示第4号)をそのまま実装する。
//  1. 3成分の加速度をそれぞれフーリエ変換する
//  2. 周期効果・ハイカット・ローカットの3つのフィルタをかける
//  3. 逆フーリエ変換で時刻歴に戻し、3成分をベクトル合成する
//  4. 合成値が a0 以上になる時間の合計がちょうど0.3秒になる a0 を求める
//  5. I = 2 log10(a0) + 0.94 。小数第3位を四捨五入し、小数第2位以下を切り捨てる
import { fft, nextPow2 } from './fft.js';

// 周期効果フィルタ: 人が感じやすい周期への重み(1/√f)
export const periodGain = (f) => Math.sqrt(1 / f);

// ハイカットフィルタ(X = f/10)
export function highCutGain(f) {
  const y = f / 10;
  const y2 = y * y;
  const poly =
    1 +
    0.694 * y2 +
    0.241 * y2 ** 2 +
    0.0557 * y2 ** 3 +
    0.009664 * y2 ** 4 +
    0.00134 * y2 ** 5 +
    0.000155 * y2 ** 6;
  return 1 / Math.sqrt(poly);
}

// ローカットフィルタ: 0.5Hzより長い周期を落とす
export const lowCutGain = (f) => Math.sqrt(1 - Math.exp(-((f / 0.5) ** 3)));

export function jmaFilterGain(f) {
  if (f <= 0) return 0;
  return periodGain(f) * highCutGain(f) * lowCutGain(f);
}

// 1成分にフィルタをかける。平均を引いてから2のべき乗までゼロ詰めしてFFTする。
export function applyJmaFilter(x, fs) {
  const n = x.length;
  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n || 1;
  for (let i = 0; i < n; i++) re[i] = x[i] - mean;
  fft(re, im);
  for (let k = 0; k <= size / 2; k++) {
    const g = jmaFilterGain((k * fs) / size);
    re[k] *= g;
    im[k] *= g;
    if (k > 0 && k < size / 2) {
      re[size - k] *= g;
      im[size - k] *= g;
    }
  }
  fft(re, im, true);
  return re.subarray(0, n);
}

// 合成値の上位から数えて0.3秒ぶん(=fs*0.3 サンプル)目の値が a0。
export function findA0(mag, fs, duration = 0.3) {
  const count = Math.round(duration * fs);
  if (mag.length < count) return null;
  const sorted = Float64Array.from(mag).sort();
  return sorted[sorted.length - count];
}

export const rawIntensity = (a0) => 2 * Math.log10(a0) + 0.94;

// 告示どおりの丸め: 小数第3位で四捨五入 → 小数第2位以下を切り捨て
export function roundIntensity(raw) {
  const r3 = Math.round(raw * 100) / 100; // 第3位を四捨五入(=第2位までに丸める)
  return Math.floor(r3 * 10 + 1e-9) / 10;
}

// 計測震度 → 震度階級
export function shindoClass(i) {
  if (i < 0.5) return '0';
  if (i < 1.5) return '1';
  if (i < 2.5) return '2';
  if (i < 3.5) return '3';
  if (i < 4.5) return '4';
  if (i < 5.0) return '5弱';
  if (i < 5.5) return '5強';
  if (i < 6.0) return '6弱';
  if (i < 6.5) return '6強';
  return '7';
}

// { ns, ew, ud } (gal) と fs(Hz) から計測震度。途中経過もすべて返す(図で見せるため)。
export function computeIntensity(comps, fs) {
  const keys = Object.keys(comps);
  if (keys.length !== 3) throw new Error('3成分の加速度が必要です');
  const n = comps[keys[0]].length;
  const filtered = {};
  for (const k of keys) filtered[k] = applyJmaFilter(comps[k], fs);
  const mag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const k of keys) s += filtered[k][i] ** 2;
    mag[i] = Math.sqrt(s);
  }
  const a0 = findA0(mag, fs);
  if (a0 == null || a0 <= 0) return { ok: false, reason: 'too-short', filtered, mag, a0 };
  const raw = rawIntensity(a0);
  const intensity = roundIntensity(raw);
  return { ok: true, filtered, mag, a0, raw, intensity, shindo: shindoClass(intensity) };
}
