// 気象庁「強震観測データ」の加速度CSV(Shift_JIS, 7行ヘッダ)を読む。
// 1行目 SITE CODE / 2 LAT / 3 LON / 4 SAMPLING RATE / 5 UNIT / 6 INITIAL TIME / 7 成分名 / 8行目以降データ
export function parseJmaCsv(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.slice(0, 7);
  const rateLine = header.find((l) => /SAMPLING RATE/i.test(l));
  const fs = rateLine ? Number(rateLine.match(/(\d+(?:\.\d+)?)\s*Hz/i)?.[1]) : NaN;
  if (!Number.isFinite(fs) || fs <= 0) throw new Error('サンプリング周波数の行が見つかりません');
  const unitLine = header.find((l) => /UNIT/i.test(l)) ?? '';
  if (!/gal/i.test(unitLine)) throw new Error('単位が gal ではありません');
  const site = (header[0] ?? '').replace(/^\s*SITE CODE=\s*/i, '').split(',')[0].trim();
  const initial = (header.find((l) => /INITIAL TIME/i.test(l)) ?? '').replace(/^.*=\s*/, '').trim();
  const names = (header[6] ?? '').split(',').map((s) => s.trim().toLowerCase());
  if (names.length !== 3) throw new Error('3成分(NS,EW,UD)の列が見つかりません');
  const cols = names.map(() => []);
  for (let i = 7; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const v = line.split(',').map(Number);
    if (v.length < 3 || v.some((x) => !Number.isFinite(x))) continue;
    for (let c = 0; c < 3; c++) cols[c].push(v[c]);
  }
  const comps = {};
  names.forEach((name, c) => (comps[name] = Float64Array.from(cols[c])));
  return { site, initial, fs, comps, length: cols[0].length };
}

// ファイル(ArrayBuffer)から。気象庁CSVは Shift_JIS。
export function decodeJmaFile(buf) {
  try {
    return new TextDecoder('shift_jis').decode(buf);
  } catch {
    return new TextDecoder().decode(buf);
  }
}
