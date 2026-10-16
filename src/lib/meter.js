// スマホの加速度サンプル → 計測震度 の流れ。DOM には触れない。
//  - 受信時刻つきサンプルをためる → 100Hz に再サンプリング → 直近 WINDOW 秒で計測震度
//  - 最初の CALIB 秒(置いて触らない)でノイズ床を測る。ノイズ床の2倍(震度で +0.6)未満は「測れない」
import { computeIntensity, jmaFilterGain } from './intensity.js';
import { resampleUniform, samplingStats } from './resample.js';

export const FS = 100; // 気象庁の強震記録と同じ 100Hz にそろえる
export const WINDOW_SEC = 5.12;
export const CALIB_SEC = 4;
export const SNR = 2; // 振幅でノイズ床の何倍あれば「測れた」とするか
export const SNR_INTENSITY = 2 * Math.log10(SNR); // = 0.60

// DeviceMotion の m/s² → gal(cm/s²)
export const toGal = (ms2) => ms2 * 100;

// 端末のサンプリングで拾えない帯域(ナイキスト周波数より上)に、気象庁フィルタの重み(パワー)が何%あるか。
export function lostFilterPower(rate, fmax = 50) {
  const nyq = rate / 2;
  if (nyq >= fmax) return 0;
  let total = 0;
  let lost = 0;
  const df = 0.01;
  for (let f = df; f <= fmax; f += df) {
    const p = jmaFilterGain(f) ** 2;
    total += p;
    if (f > nyq) lost += p;
  }
  return lost / total;
}

// 3成分(gal, 等間隔 FS)の窓から計測震度。ノイズ床が分かっていれば「測れたか」も判定する。
export function measureWindow(win, noise) {
  const r = computeIntensity({ x: win.x, y: win.y, z: win.z }, FS);
  if (!r.ok) return { ...r, measurable: false };
  const measurable = noise == null ? null : r.a0 >= noise.a0 * SNR;
  return { ...r, measurable };
}

export function createMeter({ windowSec = WINDOW_SEC, calibSec = CALIB_SEC } = {}) {
  let samples = []; // { t(ms), x, y, z }(gal)
  let calibStart = null;
  let noise = null; // { a0, raw }
  let live = null;
  let active = null; // 進行中の揺れの最大スナップショット
  const events = [];
  let allSamples = 0;

  function push(t, x, y, z) {
    samples.push({ t, x, y, z });
    allSamples++;
    if (calibStart == null) calibStart = t;
    // 窓より少し長めだけ持つ(統計用に 2 窓ぶん)
    const keepFrom = t - windowSec * 2000;
    if (samples[0].t < keepFrom) {
      let i = 0;
      while (i < samples.length && samples[i].t < keepFrom) i++;
      samples = samples.slice(i);
    }
  }

  function windowData() {
    const last = samples[samples.length - 1]?.t;
    if (last == null) return null;
    const from = last - windowSec * 1000;
    const inWin = samples.filter((p) => p.t >= from);
    const u = resampleUniform(inWin, FS);
    const need = Math.floor(windowSec * FS * 0.9);
    if (u.x.length < need) return null;
    return u;
  }

  // 定期的に呼ぶ。現在の窓で計測震度を出し、揺れの始まりと終わりを判定する。
  function update(now) {
    const win = windowData();
    if (!win) return state();
    const t = now ?? samples[samples.length - 1].t;
    if (!noise) {
      if (t - calibStart >= calibSec * 1000) {
        const r = measureWindow(win, null);
        if (r.ok) noise = { a0: r.a0, raw: r.raw, intensity: r.intensity };
      }
      live = measureWindow(win, null);
      return state();
    }
    live = measureWindow(win, noise);
    live.window = win;
    if (live.measurable) {
      if (!active || live.raw > active.raw) active = { ...live, at: t };
    } else if (active) {
      events.unshift(active);
      active = null;
    }
    return state();
  }

  function recalibrate() {
    noise = null;
    active = null;
    calibStart = samples[samples.length - 1]?.t ?? null;
  }

  function finish() {
    if (active) {
      events.unshift(active);
      active = null;
    }
  }

  function state() {
    const last = samples[samples.length - 1]?.t;
    const calibProgress = noise ? 1 : calibStart == null || last == null ? 0 : Math.min(1, (last - calibStart) / (calibSec * 1000));
    return { noise, live, active, events, calibProgress, stats: samplingStats(samples), samples: allSamples };
  }

  return { push, update, recalibrate, finish, state, events };
}
