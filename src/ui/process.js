// 計算過程の図: ①3成分 → ②フィルタ → ③合成と0.3秒ルール → ④計測震度
import { h, fmtI, fmtGal } from './dom.js';
import { drawComponents, drawFilter, drawMagnitude } from './plot.js';
import { FS } from '../lib/meter.js';

// r: computeIntensity の結果 + { comps, fs, title, noise?, nyquist?, names? }
export function processView(r) {
  const fs = r.fs ?? FS;
  const c1 = h('canvas', { class: 'plot', 'aria-label': '3成分の加速度波形' });
  const c2 = h('canvas', { class: 'plot', 'aria-label': '気象庁フィルタのゲイン' });
  const c3 = h('canvas', { class: 'plot', 'aria-label': 'フィルタ後の合成加速度と a0' });
  const count = Math.round(0.3 * fs);
  const log = Math.log10(r.a0);
  const rounded = Math.round(r.raw * 100) / 100;

  const el = h('section', { class: 'card process' },
    h('h2', {}, '計算の中身'),
    r.title ? h('p', { class: 'muted' }, r.title) : null,
    h('ol', { class: 'steps' },
      h('li', {},
        h('h3', {}, '3成分の加速度'),
        h('p', { class: 'muted' }, `${r.names ? r.names.join('・') : '端末の x・y・z'} を ${fs}Hz に並べ直したもの。向きはどうでもよく、最後にベクトルで合わせる。`),
        c1),
      h('li', {},
        h('h3', {}, '3つのフィルタ'),
        h('p', { class: 'muted' }, '各成分をフーリエ変換して、周期効果 √(1/f)・ハイカット・ローカットを掛け、逆変換で戻す。1〜2Hz の揺れほど重く数え、0.5Hz 未満と 10Hz 超は軽く数える。'),
        c2,
        h('p', { class: 'legend small' },
          h('span', { class: 'k1' }, '— 周期効果 √(1/f)'),
          h('span', { class: 'k2' }, '— ハイカット'),
          h('span', { class: 'k3' }, '— ローカット'),
          h('span', { class: 'ka' }, '━ 3つの積'))),
      h('li', {},
        h('h3', {}, '合成して、0.3秒ルール'),
        h('p', { class: 'muted' }, `フィルタ後の3成分をベクトル合成し、その値が a0 以上の時間が合計ちょうど0.3秒(${count}点)になる a0 を探す。赤い点がその${count}点。`),
        c3),
      h('li', {},
        h('h3', {}, '計測震度'),
        h('p', { class: 'formula' },
          h('span', {}, `I = 2 × log₁₀(${fmtGal(r.a0)}) + 0.94`),
          h('span', {}, `= 2 × ${log.toFixed(4)} + 0.94 = ${r.raw.toFixed(4)}`),
          h('span', {}, `小数第3位を四捨五入 → ${rounded.toFixed(2)}、第2位以下を切り捨て → `, h('strong', {}, fmtI(r.intensity))),
          h('span', {}, '震度階級 ', h('strong', {}, r.shindo)))),
    ));

  // 描画は DOM に入って幅が決まってから
  el.draw = () => {
    drawComponents(c1, r.comps, fs, { names: r.names });
    drawFilter(c2, { nyquist: r.nyquist });
    drawMagnitude(c3, r.mag, fs, r.a0, { floor: r.noise?.a0 });
  };
  return el;
}
