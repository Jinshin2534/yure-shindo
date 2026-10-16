import './style.css';
import { h, fmtI, fmtGal, fmtTime } from './ui/dom.js';
import { drawLive } from './ui/plot.js';
import { processView } from './ui/process.js';
import { createMeter, toGal, lostFilterPower, SNR, SNR_INTENSITY, FS, CALIB_SEC } from './lib/meter.js';
import { computeIntensity, shindoClass } from './lib/intensity.js';
import { synthScene, SCENES } from './lib/synth.js';
import { parseJmaCsv, decodeJmaFile } from './lib/jmaCsv.js';
import { VERIFIED } from './verified.js';

const DEMO_LEAD = 5.5; // デモの先頭に入れる静置(ノイズ床の測定ぶん)

const app = {
  meter: createMeter(),
  mode: 'idle', // idle | sensor | demo
  source: null, // 停止用
  label: null, // デモの場面名
  events: [], // { ...result, wall, label }
  selected: null,
  message: null,
};

// ---------- 入力源 ----------
function resetMeter() {
  app.meter = createMeter();
  app.selected = null;
}

async function startSensor() {
  stop();
  if (typeof window.DeviceMotionEvent === 'undefined') {
    app.message = 'このブラウザは加速度センサー(DeviceMotion)に対応していません。下のデモをどうぞ。';
    return render();
  }
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') {
        app.message = 'センサーの利用が許可されませんでした。設定 → Safari → モーションと画面の向きのアクセス を確認してください。';
        return render();
      }
    }
  } catch (e) {
    app.message = `センサーの許可を取れませんでした(${e.message})`;
    return render();
  }
  resetMeter();
  app.mode = 'sensor';
  app.label = null;
  app.message = null;
  let got = 0;
  const onMotion = (e) => {
    const a = e.accelerationIncludingGravity;
    if (a == null || a.x == null) return;
    got++;
    app.meter.push(e.timeStamp || performance.now(), toGal(a.x), toGal(a.y), toGal(a.z));
  };
  window.addEventListener('devicemotion', onMotion);
  const timer = setInterval(tick, 250);
  const noSensor = setTimeout(() => {
    if (got === 0) {
      stop();
      app.message = '加速度センサーの値が届きません。PCなどセンサーのない端末では、下のデモで試せます。';
      render();
    }
  }, 2000);
  let lock = null;
  try {
    lock = await navigator.wakeLock?.request('screen');
  } catch {}
  app.source = () => {
    window.removeEventListener('devicemotion', onMotion);
    clearInterval(timer);
    clearTimeout(noSensor);
    lock?.release?.().catch(() => {});
  };
  render();
}

// 合成した揺れを、センサーと同じ経路(push → update)で流す。speed で早回しできる。
function startDemo(scene, { speed = 1 } = {}) {
  stop();
  resetMeter();
  app.mode = 'demo';
  app.label = SCENES[scene].label;
  app.message = null;
  const samples = synthScene(scene, { lead: DEMO_LEAD, seed: Math.floor(Math.random() * 1e6) + 1 });
  const end = samples[samples.length - 1].t;
  const t0 = performance.now();
  let i = 0;
  let lastUpdate = -Infinity;
  const feed = () => {
    const now = (performance.now() - t0) * speed;
    const before = lastUpdate;
    while (i < samples.length && samples[i].t <= now) {
      const p = samples[i++];
      app.meter.push(p.t, p.x, p.y, p.z);
      if (p.t - lastUpdate >= 250) {
        lastUpdate = p.t;
        tick(false);
      }
    }
    if (lastUpdate !== before) render();
    if (now > end) {
      stop();
      render();
    }
  };
  const timer = setInterval(feed, 40);
  app.source = () => {
    clearInterval(timer);
    app.meter.finish();
    collectEvents();
  };
  render();
}

function stop() {
  app.source?.();
  app.source = null;
  if (app.mode !== 'idle') app.mode = 'idle';
}

function tick(draw = true) {
  app.meter.update();
  collectEvents();
  if (draw) render();
}

// メーターで確定した揺れを記録に移す(壁時計と名前をつける)
function collectEvents() {
  const fresh = app.meter.events.splice(0);
  for (const e of fresh.reverse()) {
    const st = app.meter.state();
    app.events.unshift({
      ...e,
      wall: Date.now(),
      label: app.label ?? `記録 ${app.events.length + 1}`,
      noise: st.noise,
      stats: st.stats,
    });
    app.selected = app.events[0];
  }
}

async function loadCsv(file) {
  try {
    const text = decodeJmaFile(await file.arrayBuffer());
    loadCsvText(text, file.name);
  } catch (e) {
    app.message = `読み込めませんでした: ${e.message}`;
    render();
  }
}

function loadCsvText(text, name = '') {
  const d = parseJmaCsv(text);
  const r = computeIntensity(d.comps, d.fs);
  if (!r.ok) throw new Error('記録が短すぎます');
  stop();
  app.message = null;
  app.selected = {
    ...r,
    comps: d.comps,
    fs: d.fs,
    names: ['南北', '東西', '上下'],
    scroll: true,
    title: `気象庁CSV ${d.site}(${d.initial} から ${(d.length / d.fs).toFixed(0)}秒、${d.fs}Hz)${name ? ' — ' + name : ''}。気象庁のページの計測震度と見比べてください。`,
  };
  render();
  return app.selected;
}

// ---------- 描画 ----------
const root = document.getElementById('app');
const liveCanvas = h('canvas', { class: 'plot live', 'aria-label': '直近の加速度' });
const fileInput = h('input', {
  type: 'file',
  accept: '.csv,text/csv',
  class: 'visually-hidden',
  onChange: (e) => e.target.files[0] && loadCsv(e.target.files[0]),
});
let drawnSelected = null;
const parts = {};

function shell() {
  parts.reading = h('div', { class: 'reading' });
  parts.controls = h('div', { class: 'controls' });
  parts.events = h('div', { class: 'events' });
  parts.process = h('div');
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  parts.honesty = h('div');
  put(root,
    h('main', { class: 'screen' },
      h('header', { class: 'app-header' },
        h('h1', {}, 'ゆれ震度計'),
        h('p', {}, 'ドアを閉めた、足踏みした、トラックが通った。その揺れに、気象庁の計測震度の計算式をそのまま当てる。')),
      h('section', { class: 'card meter' }, parts.reading, liveCanvas, parts.controls),
      coarse ? null : demoSection(),
      h('section', { class: 'card' },
        h('h2', {}, '揺れの記録'),
        parts.events),
      parts.process,
      coarse ? demoSection() : null,
      parts.honesty,
      verifiedSection(),
      h('footer', { class: 'muted small' },
        '計算方法: 気象庁「計測震度の算出方法」(平成8年 気象庁告示第4号)。',
        h('a', { href: 'https://www.jma.go.jp/jma/kishou/know/jishin/kyoshin/kaisetsu/calc_sindo.html', target: '_blank', rel: 'noopener' }, '気象庁の解説'),
        '。地震の揺れの判断には使わないでください。')));
}

function demoSection() {
  return h('section', { class: 'card demo' },
    h('h2', {}, 'センサーがなくても'),
    h('p', { class: 'muted' }, 'スマホを机に置いたときの揺れを合成して、同じ経路で流します。最初の5秒は静置(ノイズ床の測定)です。'),
    h('div', { class: 'chips' },
      ...['door', 'stomp', 'tiptoe', 'truck', 'quiet'].map((k) =>
        h('button', { type: 'button', class: 'chip', onClick: () => startDemo(k) }, SCENES[k].label))),
    h('p', { class: 'muted' },
      '本物の地震でも確かめられます。',
      h('a', { href: 'https://www.data.jma.go.jp/eqev/data/kyoshin/jishin/index.html', target: '_blank', rel: 'noopener' }, '気象庁の強震観測データ'),
      ' から観測点の「ダウンロード」(CSV)を保存して読み込むと、計算の中身つきで計測震度を出します。'),
    h('button', { type: 'button', class: 'secondary', onClick: () => fileInput.click() }, '気象庁のCSVを読み込む'),
    fileInput);
}

// replaceChildren は null を文字列 "null" にしてしまうので除く
const put = (el, ...children) => el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));

function render() {
  if (!parts.reading) shell();
  const st = app.meter.state();
  renderReading(st);
  renderControls();
  renderEvents();
  renderProcess();
  renderHonesty(st);
  const win = st.live?.window;
  liveCanvas.hidden = !win;
  if (win && app.mode !== 'idle') drawLive(liveCanvas, win);
}

function renderReading(st) {
  const r = parts.reading;
  const status = (text) => h('p', { class: 'status' }, text);
  if (app.mode === 'idle' && !st.live) {
    put(r,
      h('p', { class: 'big-label' }, 'スマホを机に置いて、はじめる'),
      h('p', { class: 'muted' }, `最初の${CALIB_SEC}秒は触らずに。その間の揺れ(ノイズ)を「測れる下限」にします。`),
      app.message ? h('p', { class: 'error' }, app.message) : null);
    return;
  }
  const head = app.mode === 'demo' ? `デモ: ${app.label}` : app.mode === 'sensor' ? 'センサーで計測中' : '停止中';
  if (!st.noise) {
    put(r,
      status(head),
      h('p', { class: 'big-label' }, '置いたまま触らないで…'),
      h('div', { class: 'progress' }, h('div', { style: `width:${Math.round(st.calibProgress * 100)}%` })),
      h('p', { class: 'muted' }, 'ノイズ床を測っています'));
    return;
  }
  const live = st.live;
  const can = live?.ok && live.measurable;
  const limit = st.noise.raw + SNR_INTENSITY;
  put(r,
    status(head),
    h('div', { class: `big ${can ? '' : 'cannot'}` },
      h('span', { class: 'big-cap' }, app.mode === 'idle' ? '最後の窓' : 'いまの揺れ'),
      can
        ? h('span', { class: 'big-num' }, fmtI(live.intensity))
        : h('span', { class: 'big-num na' }, '測れない'),
      can ? h('span', { class: 'big-unit' }, `計測震度(震度${live.shindo})`) : h('span', { class: 'big-unit' }, `ノイズ床の${SNR}倍(計測震度 ${limit.toFixed(2)})に届かない`)),
    h('p', { class: 'muted small' },
      `ノイズ床: a0 ${fmtGal(st.noise.a0)} gal = 計測震度 ${st.noise.raw.toFixed(2)}`,
      live?.ok ? ` / いまの窓: a0 ${fmtGal(live.a0)} gal = ${live.raw.toFixed(2)}` : ''),
    app.message ? h('p', { class: 'error' }, app.message) : null);
}

function renderControls() {
  const c = parts.controls;
  const running = app.mode !== 'idle';
  put(c,
    running
      ? h('button', { type: 'button', class: 'secondary', onClick: () => { stop(); render(); } }, '止める')
      : h('button', { type: 'button', class: 'primary', onClick: startSensor }, 'センサーで測る'),
    app.mode === 'sensor'
      ? h('button', { type: 'button', class: 'secondary', onClick: () => { app.meter.recalibrate(); render(); } }, 'ノイズ床を測り直す')
      : null);
}

function renderEvents() {
  if (!app.events.length) {
    parts.events.replaceChildren(h('p', { class: 'empty' }, 'まだありません。ノイズ床の2倍を超えた揺れが、ここに1回ずつ残ります。'));
    return;
  }
  parts.events.replaceChildren(
    h('ul', { class: 'event-list' },
      ...app.events.slice(0, 30).map((e) =>
        h('li', {},
          h('button', {
            type: 'button',
            class: `event ${app.selected === e ? 'on' : ''}`,
            onClick: () => { app.selected = e; render(); },
          },
          h('span', { class: 'ev-num' }, fmtI(e.intensity)),
          h('span', { class: 'ev-body' },
            h('strong', {}, e.label),
            h('span', { class: 'muted small' }, `${fmtTime(e.wall)} ・ 震度${e.shindo} ・ a0 ${fmtGal(e.a0)} gal`)))))));
}

function renderProcess() {
  const sel = app.selected;
  if (sel === drawnSelected) return;
  drawnSelected = sel;
  if (!sel) {
    parts.process.replaceChildren();
    return;
  }
  const view = processView({
    ...sel,
    comps: sel.comps ?? { x: sel.window.x, y: sel.window.y, z: sel.window.z },
    fs: sel.fs ?? FS,
    nyquist: sel.stats ? sel.stats.rate / 2 : undefined,
    title: sel.title ?? `${sel.label}: 揺れが最も強かった ${(sel.window?.x.length / FS).toFixed(2)} 秒の窓で計算`,
  });
  parts.process.replaceChildren(view);
  view.draw();
  if (sel.scroll) {
    sel.scroll = false;
    view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderHonesty(st) {
  const s = st.stats;
  const rows = [];
  const row = (k, v, note) => rows.push(h('tr', {}, h('th', {}, k), h('td', {}, h('strong', {}, v), h('span', { class: 'note muted small' }, note))));
  if (s && st.samples > 30) {
    const lost = lostFilterPower(s.rate);
    row('サンプリング', `${s.rate.toFixed(1)} Hz`, '震度計は 100Hz。時刻を見て 100Hz に並べ直している');
    row('間隔のばらつき', `±${s.jitterMs.toFixed(1)} ms`, `最大の空き ${s.maxGapMs.toFixed(0)} ms`);
    row('取りこぼし', `${(s.gapRatio * 100).toFixed(1)} %`, '間隔が中央値の1.5倍を超えた割合');
    row('拾えない帯域', `${(lost * 100).toFixed(2)} %`, `フィルタの重みのうち ${(s.rate / 2).toFixed(0)}Hz 超の分`);
  }
  if (st.noise) {
    row('ノイズ床', `${fmtGal(st.noise.a0)} gal`, `じっとしていても計測震度 ${st.noise.raw.toFixed(2)} 相当の揺れが出る`);
    row('測れる下限', `計測震度 ${(st.noise.raw + SNR_INTENSITY).toFixed(2)}`, `ノイズ床の${SNR}倍。これ未満は「測れない」と出す`);
  }
  parts.honesty.replaceChildren(
    h('section', { class: 'card honesty' },
      h('h2', {}, 'スマホは地震計ではない'),
      rows.length
        ? h('table', { class: 'facts' }, h('tbody', {}, rows))
        : h('p', { class: 'muted' }, '測り始めると、この端末のサンプリングとノイズの数字がここに出ます。'),
      h('ul', { class: 'caveats' },
        h('li', {}, '震度計は地面に据えた台にボルトで留めてある。スマホは机に置いただけなので、机の天板や脚の揺れ方(共振)がそのまま混ざる。出るのは「その机の上の揺れ」で、地面の震度ではない。'),
        h('li', {}, '震度計は計測震度 ±0.1 以内で検定されている。この端末とこのアプリは検定されていない。'),
        h('li', {}, `ここでは ${(5.12).toFixed(2)} 秒の窓で計算している(震度計は地震の揺れ全体)。短い揺れほど窓の取り方で値が変わる。`))));
}

function verifiedSection() {
  return h('section', { class: 'card' },
    h('h2', {}, '本物の地震で検算済み'),
    h('p', { class: 'muted' }, '気象庁が公開している観測波形にこのアプリの計算をかけ、公表された計測震度と比べた結果。15観測点中14点で一致。新千歳空港だけは 5.493 と出て、境界 5.5 の 0.007 手前で 5.4 に切り捨てられる(実機の震度計は時間領域のフィルタで近似しており、この程度の差は検定基準 ±0.1 の内側)。'),
    h('table', { class: 'facts verified' },
      h('thead', {}, h('tr', {}, h('th', {}, '観測点'), h('th', {}, '公表'), h('th', {}, 'このアプリ'))),
      h('tbody', {},
        ...VERIFIED.map((v) => h('tr', {},
          h('th', {}, v.name, h('span', { class: 'note muted small' }, v.event)),
          h('td', {}, `${v.official.toFixed(1)}`),
          h('td', { class: v.match ? '' : 'diff' }, `${v.raw.toFixed(3)} → ${v.ours.toFixed(1)}`))))));
}

// ヘッドレス検証用
window.__app = {
  state: () => ({ ...app.meter.state(), mode: app.mode, events: app.events, selected: app.selected }),
  startDemo,
  stop: () => { stop(); render(); },
  loadCsvText,
  computeIntensity,
  shindoClass,
  synthScene,
  createMeter,
};

window.addEventListener('resize', () => {
  drawnSelected = null;
  render();
});
render();
