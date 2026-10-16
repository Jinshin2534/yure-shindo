// 実機がなくても動かせるよう、スマホを机に置いたときの「らしい」加速度を合成する。
// DeviceMotion と同じく、受信時刻にばらつき(ジッタ・取りこぼし)のあるサンプル列を返す。単位は gal。
// 振幅は実測ではなく目安(机の上でドア数十gal・足踏み10gal前後・トラック数gal)。
// センサーのノイズは各軸 0.8gal(≒0.8mg)。スマホの加速度計としては標準的な値。

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// 減衰振動(机の天板が鳴る感じ)
const ring = (t, f, tau) => (t < 0 ? 0 : Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t));

export const SCENES = {
  quiet: { label: '静置(ノイズだけ)', duration: 8, signal: () => [0, 0, 0] },
  door: {
    label: 'ドアを閉めた',
    duration: 8,
    signal: (t) => {
      const u = t - 3;
      const v = 40 * ring(u, 10, 0.25) + 15 * ring(u, 23, 0.06);
      return [0.5 * v, 0.35 * v, v];
    },
  },
  stomp: {
    label: '足踏み',
    duration: 8,
    signal: (t) => {
      let v = 0;
      for (let k = 0; k < 6; k++) v += 9 * ring(t - 2.5 - k * 0.55, 7, 0.12);
      return [0.3 * v, 0.25 * v, v];
    },
  },
  tiptoe: {
    label: 'となりの部屋をそっと歩く',
    duration: 8,
    signal: (t) => {
      let v = 0;
      for (let k = 0; k < 5; k++) v += 2.5 * ring(t - 2.5 - k * 0.7, 7, 0.1);
      return [0.3 * v, 0.25 * v, v];
    },
  },
  truck: {
    label: 'トラックが通った',
    duration: 10,
    signal: (t, rand, st) => {
      // 2〜6Hz の帯域ノイズ(2次の共振で色づけ)に、近づいて遠ざかる包絡をかける
      const env = Math.exp(-(((t - 5) / 1.8) ** 2));
      st.v ??= [0, 0, 0];
      st.p ??= [0, 0, 0];
      const out = [];
      for (let c = 0; c < 3; c++) {
        const w = 2 * Math.PI * (3 + c);
        const dt = 0.002;
        const a = gauss(rand) * 6300 - w * w * st.p[c] - 2 * 0.3 * w * st.v[c];
        st.v[c] += a * dt;
        st.p[c] += st.v[c] * dt;
        out.push(env * st.p[c] * (c === 2 ? 1 : 0.6));
      }
      return out;
    },
  },
};

// rate: 端末の平均サンプリング周波数 / jitterMs: 間隔のばらつき / dropRate: 取りこぼしの割合
// noiseGal: センサーのノイズ(各軸の標準偏差)/ quantGal: 量子化の刻み / lead: 先頭に足す静置の秒数(ノイズ床の測定用)
export function synthScene(name, { rate = 60, jitterMs = 2.5, dropRate = 0.02, noiseGal = 0.8, quantGal = 0.12, gravity = true, seed = 7, gain = 1, lead = 0 } = {}) {
  const scene = SCENES[name];
  if (!scene) throw new Error(`unknown scene: ${name}`);
  const rand = rng(seed);
  const st = {};
  const out = [];
  const dt = 1000 / rate;
  // 信号は 500Hz で回して(トラックの共振を安定させるため)、受信時刻で間引く
  const inner = [];
  const total = lead + scene.duration;
  for (let t = 0; t <= total; t += 0.002) inner.push(t < lead ? [0, 0, 0] : scene.signal(t - lead, rand, st));
  const at = (sec) => inner[Math.min(inner.length - 1, Math.max(0, Math.round(sec / 0.002)))];
  const q = (v) => (quantGal > 0 ? Math.round(v / quantGal) * quantGal : v);
  let t = 0;
  while (t <= total * 1000) {
    if (rand() >= dropRate) {
      const s = at(t / 1000);
      out.push({
        t,
        x: q(gain * s[0] + noiseGal * gauss(rand)),
        y: q(gain * s[1] + noiseGal * gauss(rand)),
        z: q(gain * s[2] + noiseGal * gauss(rand) + (gravity ? 980.665 : 0)),
      });
    }
    t += Math.max(1, dt + jitterMs * gauss(rand));
  }
  return out;
}
