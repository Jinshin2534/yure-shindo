export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// 計測震度の表示(負の値もそのまま出す。-0.0 は 0.0 に)
export const fmtI = (i) => (Object.is(i, -0) || Math.abs(i) < 1e-9 ? '0.0' : i.toFixed(1));
export const fmtGal = (g) => (g >= 10 ? g.toFixed(1) : g >= 1 ? g.toFixed(2) : g.toFixed(3));
export const fmtTime = (t) => new Date(t).toLocaleTimeString('ja-JP');
