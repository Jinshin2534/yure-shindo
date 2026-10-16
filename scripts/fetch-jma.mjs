// 気象庁の強震波形CSVを tests/fixtures/jma/ に取得する(リポジトリには含めない)。
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JMA_BASE, JMA_STATIONS, localName } from '../tests/fixtures/jma-stations.js';

const dir = fileURLToPath(new URL('../tests/fixtures/jma/', import.meta.url));
await mkdir(dir, { recursive: true });

for (const s of JMA_STATIONS) {
  const out = dir + localName(s);
  try {
    await access(out);
    console.log(`skip  ${s.name}`);
    continue;
  } catch {}
  const url = `${JMA_BASE}/${s.event}/data/${s.file}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`fail  ${s.name} ${res.status} ${url}`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log(`ok    ${s.name}`);
}
