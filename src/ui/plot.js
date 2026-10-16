// Canvas2D の小さな描画関数群。色は CSS 変数から取る。
import { jmaFilterGain, periodGain, highCutGain, lowCutGain } from '../lib/intensity.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';

export function setupCanvas(canvas, height) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, height);
  return { ctx, w, h: height };
}

// 長い列を描画幅に合わせて間引く(区間ごとの最小・最大を残す)
function envelope(arr, cols) {
  const n = arr.length;
  const out = [];
  const step = n / cols;
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * step);
    const b = Math.max(a + 1, Math.floor((c + 1) * step));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = a; i < b && i < n; i++) {
      if (arr[i] < lo) lo = arr[i];
      if (arr[i] > hi) hi = arr[i];
    }
    out.push([lo, hi]);
  }
  return out;
}

function label(ctx, text, x, y, color, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

// 3成分の波形(平均を引いて、共通の縦スケールで縦に並べる)
export function drawComponents(canvas, comps, fs, { height = 168, names } = {}) {
  const { ctx, w, h } = setupCanvas(canvas, height);
  const keys = Object.keys(comps);
  const lanes = keys.map((k) => {
    const a = comps[k];
    let m = 0;
    for (let i = 0; i < a.length; i++) m += a[i];
    m /= a.length || 1;
    return Float64Array.from(a, (v) => v - m);
  });
  let peak = 1e-9;
  for (const l of lanes) for (const v of l) peak = Math.max(peak, Math.abs(v));
  const laneH = h / keys.length;
  const colors = [css('--c1'), css('--c2'), css('--c3')];
  lanes.forEach((l, li) => {
    const mid = laneH * (li + 0.5);
    ctx.strokeStyle = css('--grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    ctx.strokeStyle = colors[li % 3];
    ctx.beginPath();
    envelope(l, Math.floor(w)).forEach(([lo, hi], x) => {
      ctx.moveTo(x + 0.5, mid - (hi / peak) * laneH * 0.45);
      ctx.lineTo(x + 0.5, mid - (lo / peak) * laneH * 0.45 + 0.5);
    });
    ctx.stroke();
    label(ctx, (names ?? keys)[li], 4, mid - laneH * 0.3, css('--muted'));
  });
  label(ctx, `最大 ${peak.toFixed(peak >= 10 ? 0 : 2)} gal / ${(lanes[0].length / fs).toFixed(1)}秒`, w - 4, h - 4, css('--muted'), 'right');
}

// 気象庁フィルタのゲイン(両対数)。nyquist を渡すと端末で拾えない帯域を塗る。
export function drawFilter(canvas, { height = 168, nyquist } = {}) {
  const { ctx, w, h } = setupCanvas(canvas, height);
  const fmin = 0.05;
  const fmax = 50;
  const gmin = 0.01;
  const gmax = 5;
  const X = (f) => (Math.log10(f / fmin) / Math.log10(fmax / fmin)) * w;
  const Y = (g) => h - 16 - (Math.log10(g / gmin) / Math.log10(gmax / gmin)) * (h - 24);
  if (nyquist && nyquist < fmax) {
    ctx.fillStyle = css('--shade');
    ctx.fillRect(X(nyquist), 0, w - X(nyquist), h - 16);
    label(ctx, '端末で拾えない', w - 4, h - 22, css('--muted'), 'right');
  }
  ctx.strokeStyle = css('--grid');
  for (const f of [0.1, 1, 10]) {
    ctx.beginPath();
    ctx.moveTo(X(f), 0);
    ctx.lineTo(X(f), h - 16);
    ctx.stroke();
    label(ctx, `${f}Hz`, X(f), h - 3, css('--muted'), 'center');
  }
  const curve = (fn, color, width, dash = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const f = fmin * (fmax / fmin) ** (x / w);
      const g = Math.max(gmin, Math.min(gmax, fn(f)));
      if (x === 0) ctx.moveTo(x, Y(g));
      else ctx.lineTo(x, Y(g));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  curve(periodGain, css('--c1'), 1, [4, 3]);
  curve(highCutGain, css('--c2'), 1, [4, 3]);
  curve(lowCutGain, css('--c3'), 1, [4, 3]);
  curve(jmaFilterGain, css('--accent'), 2.5);
}

// フィルタ後の3成分合成 |a(t)| と a0 の線。a0 以上(合計0.3秒)の点を赤で塗る。
export function drawMagnitude(canvas, mag, fs, a0, { height = 170, floor } = {}) {
  const { ctx, w, h } = setupCanvas(canvas, height);
  let peak = 1e-9;
  for (const v of mag) peak = Math.max(peak, v);
  const top = Math.max(peak, floor ?? 0) * 1.1;
  const Y = (v) => h - 14 - (v / top) * (h - 22);
  const n = mag.length;
  const cols = Math.floor(w);
  ctx.strokeStyle = css('--ink');
  ctx.lineWidth = 1;
  ctx.beginPath();
  envelope(mag, cols).forEach(([lo, hi], x) => {
    ctx.moveTo(x + 0.5, Y(hi));
    ctx.lineTo(x + 0.5, Y(lo) + 0.5);
  });
  ctx.stroke();
  // a0 以上の点
  ctx.fillStyle = css('--accent');
  for (let i = 0; i < n; i++) {
    if (mag[i] >= a0) ctx.fillRect((i / n) * w - 1, Y(mag[i]) - 1, 3, 3);
  }
  const line = (v, color, text, dash, align = 'left') => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(0, Y(v));
    ctx.lineTo(w, Y(v));
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, text, align === 'left' ? 4 : w - 4, Y(v) - 4, color, align);
  };
  if (floor != null) line(floor, css('--muted'), `ノイズ床 ${floor.toFixed(2)} gal`, [2, 3], 'right');
  line(a0, css('--accent'), `a0 = ${a0.toFixed(a0 >= 10 ? 1 : 3)} gal`, [6, 3]);
  label(ctx, `${(n / fs).toFixed(1)}秒`, w - 4, h - 2, css('--muted'), 'right');
}

// ライブの帯(直近の |加速度 - 平均| を流す)
export function drawLive(canvas, series, { height = 96 } = {}) {
  const { ctx, w, h } = setupCanvas(canvas, height);
  if (!series || series.x.length < 2) return;
  drawComponentsInto(ctx, w, h, series);
}

function drawComponentsInto(ctx, w, h, s) {
  const lanes = [s.x, s.y, s.z].map((a) => {
    let m = 0;
    for (const v of a) m += v;
    m /= a.length;
    return Float64Array.from(a, (v) => v - m);
  });
  let peak = 2; // 2gal 未満は拡大しない(ノイズを大きく見せない)
  for (const l of lanes) for (const v of l) peak = Math.max(peak, Math.abs(v));
  const colors = [css('--c1'), css('--c2'), css('--c3')];
  const mid = h / 2;
  lanes.forEach((l, li) => {
    ctx.strokeStyle = colors[li];
    ctx.lineWidth = 1;
    ctx.beginPath();
    envelope(l, Math.floor(w)).forEach(([lo, hi], x) => {
      ctx.moveTo(x + 0.5, mid - (hi / peak) * h * 0.45);
      ctx.lineTo(x + 0.5, mid - (lo / peak) * h * 0.45 + 0.5);
    });
    ctx.stroke();
  });
  label(ctx, `±${peak.toFixed(1)} gal`, w - 4, 12, css('--muted'), 'right');
}
