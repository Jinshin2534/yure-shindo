// DeviceMotionEvent は端末ごとに間隔がばらつく(60Hz前後・取りこぼしあり)。
// 受信時刻つきのサンプルを、一定間隔(fs)に線形補間で並べ直す。

// samples: [{ t: ミリ秒, x, y, z }](t は単調増加とは限らないので並べ替える)
export function resampleUniform(samples, fs) {
  const s = [...samples].filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  if (s.length < 2) return { fs, t0: s[0]?.t ?? 0, x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0) };
  const t0 = s[0].t;
  const dt = 1000 / fs;
  const n = Math.floor((s[s.length - 1].t - t0) / dt) + 1;
  const out = { fs, t0, x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    while (j < s.length - 2 && s[j + 1].t < t) j++;
    const a = s[j];
    const b = s[j + 1];
    const span = b.t - a.t;
    const w = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    out.x[i] = a.x + (b.x - a.x) * w;
    out.y[i] = a.y + (b.y - a.y) * w;
    out.z[i] = a.z + (b.z - a.z) * w;
  }
  return out;
}

// 受信間隔の統計。中央値から実効サンプリング周波数、ばらつき、取りこぼし(中央値の1.5倍超の間隔)を出す。
export function samplingStats(samples) {
  const t = samples.map((p) => p.t).filter(Number.isFinite).sort((a, b) => a - b);
  if (t.length < 3) return null;
  const d = [];
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
  const sorted = [...d].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
  const gaps = d.filter((x) => x > median * 1.5).length;
  return {
    rate: median > 0 ? 1000 / median : 0,
    medianMs: median,
    jitterMs: sd,
    gapRatio: gaps / d.length,
    maxGapMs: sorted[sorted.length - 1],
  };
}
