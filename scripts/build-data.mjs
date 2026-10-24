// Builds public/data/ from the hand-authored word files in data-src/.
// Each source file is a JSON array of entries (see data-src/SPEC.md).
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'data-src');
const outDir = join(root, 'public', 'data');

// Every data-src file whose name starts with `prefix` feeds the list. Lists
// longer than MAX_SET are split into evenly sized numbered sets.
const LISTS = [
  { id: 'e1-verbs', group: 'eiken', title: 'Verbs', sub: '動詞', prefix: 'eiken1-verbs' },
  { id: 'e1-adj', group: 'eiken', title: 'Adjectives', sub: '形容詞', prefix: 'eiken1-adj' },
  { id: 'e1-nouns', group: 'eiken', title: 'Nouns', sub: '名詞', prefix: 'eiken1-nouns' },
  { id: 'e1-adv', group: 'eiken', title: 'Adverbs', sub: '副詞', prefix: 'eiken1-adverbs' },
  { id: 'e1-phrasal', group: 'eiken', title: 'Phrasal verbs', sub: '句動詞', prefix: 'eiken1-phrasal' },
  { id: 'anime-phrases', group: 'anime', title: 'Everyday phrases & slang', sub: '日常会話・スラング', prefix: 'anime-phrases' },
  { id: 'anime-story', group: 'anime', title: 'Story & battle words', sub: 'ファンタジー・バトル', prefix: 'anime-story' },
];
const MAX_SET = 250;

const POS = new Set(['v', 'adj', 'n', 'adv', 'phr']);

function slug(w) {
  return w
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Deterministic shuffle so the working set mixes letters instead of drilling a→b→c.
function shuffle(arr, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'list'), { recursive: true });

const seenGlobal = new Map();
const index = [];
let warnings = 0;
const warn = (msg) => {
  warnings++;
  console.warn('  ! ' + msg);
};

const srcFiles = readdirSync(srcDir).filter((f) => f.endsWith('.json')).sort();

for (const list of LISTS) {
  const items = [];
  const files = srcFiles.filter((f) => f.startsWith(list.prefix)).map((f) => f.slice(0, -5));
  if (!files.length) warn(`no files for ${list.id}`);
  for (const f of files) {
    const entries = JSON.parse(readFileSync(join(srcDir, f + '.json'), 'utf8'));
    for (const e of entries) {
      const where = `${f}: "${e.w}"`;
      if (!e.w || !e.ja || !e.en || !e.ex || !e.f) {
        warn(`${where} missing a field — dropped`);
        continue;
      }
      if (!e.ex.includes(e.f)) {
        warn(`${where} form "${e.f}" not in example — dropped`);
        continue;
      }
      const id = slug(e.w);
      if (seenGlobal.has(id)) {
        warn(`${where} duplicate of ${seenGlobal.get(id)} — dropped`);
        continue;
      }
      seenGlobal.set(id, f);
      if (e.pos && !POS.has(e.pos)) warn(`${where} odd pos "${e.pos}"`);
      items.push({
        id,
        w: e.w.trim(),
        pos: e.pos,
        m: e.ja.trim(),
        en: e.en.trim(),
        ex: e.ex.trim(),
        f: e.f,
        exJa: e.exJa?.trim() || undefined,
        note: e.note?.trim() || undefined,
      });
    }
  }
  if (!items.length) continue;
  items.sort((a, b) => a.id.localeCompare(b.id));
  shuffle(items, [...list.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const sets = Math.ceil(items.length / MAX_SET);
  const size = Math.ceil(items.length / sets);
  for (let s = 0; s < sets; s++) {
    const chunk = items.slice(s * size, (s + 1) * size);
    const id = sets > 1 ? `${list.id}-${s + 1}` : list.id;
    const title = sets > 1 ? `${list.title} ${s + 1}` : list.title;
    writeFileSync(join(outDir, 'list', id + '.json'), JSON.stringify({ id, items: chunk }));
    index.push({ id, group: list.group, title, sub: list.sub, count: chunk.length });
    console.log(`${id}: ${chunk.length} words`);
  }
}

writeFileSync(
  join(outDir, 'lists.json'),
  JSON.stringify({ version: 1, built: new Date().toISOString().slice(0, 10), lists: index }, null, 1)
);
console.log(`wrote ${index.length} lists${warnings ? `, ${warnings} warnings` : ''}`);
