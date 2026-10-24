import type { Group, ListMeta, ListsIndex, RawItem, StudyItem, WordRow } from './types';
import { computeDirs } from './facets';
import { findForm } from './cloze';
import { db } from './db';

const BASE = import.meta.env.BASE_URL;

/** Normalize a headword for identity/collision checks. */
export function wordKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?。、,;:"“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Join parts with sep, truncating with … once maxLen is exceeded. */
export function capText(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

/** Split a meaning into comparable senses, ignoring （context） notes. */
export function meaningKeys(m?: string): Set<string> {
  const out = new Set<string>();
  if (!m) return out;
  for (const part of m.replace(/[（(][^）)]*[）)]/g, '').split(/[、，,／/;；・]|\s+or\s+/)) {
    const k = part.replace(/[〜～「」…。!！?？\s]/g, '').toLowerCase();
    if (k.length >= 2) out.add(k);
    // kanji stem + first okurigana, so 怪しい and 怪しげな collide
    const stem = /^[㐀-鿿々]+[ぁ-ゖ]?/.exec(k)?.[0];
    if (stem && stem.length >= 2) out.add('~' + stem);
  }
  return out;
}

const STOP = new Set(
  'about above after again against being below between could doing during each from have having into itself more most other ought same should some someone something somebody such than that their them then there these they this those through under until very what when where which while with would your yours often usually especially person people thing things'.split(' ')
);

/** Content words of an English definition, for spotting near-synonyms. */
export function defKeys(en?: string): Set<string> {
  const out = new Set<string>();
  for (const w of (en ?? '').toLowerCase().match(/[a-z]+/g) ?? []) {
    if (w.length >= 5 && !STOP.has(w)) out.add(w);
  }
  return out;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

let listsPromise: Promise<ListsIndex> | null = null;
export function getListsIndex(): Promise<ListsIndex> {
  return (listsPromise ??= fetchJson<ListsIndex>('data/lists.json'));
}

interface Fields {
  id: string;
  w: string;
  pos?: string;
  m?: string;
  en?: string;
  ex?: string;
  f?: string;
  exJa?: string;
  dex?: string;
  note?: string;
  src?: string;
  sug?: string;
  orig?: string;
  /** Example borrowed from a built-in list entry for the same word. */
  bex?: string;
  bexJa?: string;
}

export function makeItem(listId: string, group: Group, r: Fields): StudyItem {
  const m = r.m?.trim() || undefined;
  const en = r.en?.trim() || undefined;
  const ex = r.ex?.trim() || undefined;
  const dex = r.dex?.trim() || undefined;
  const bex = r.bex?.trim() || undefined;

  // Prefer her own sentence for the blank, then a built-in list's, then the dictionary's.
  let form: string | undefined;
  let clozeSentence: string | undefined;
  for (const s of [ex, bex, dex]) {
    if (!s) continue;
    const f = r.f && s === ex && s.includes(r.f) ? r.f : findForm(r.w, s);
    if (f) {
      form = f;
      clozeSentence = s;
      break;
    }
  }

  return {
    id: r.id,
    listId,
    group,
    w: r.w.trim(),
    pos: r.pos,
    m,
    en,
    ex,
    exJa: r.exJa?.trim() || undefined,
    dex,
    note: r.note?.trim() || undefined,
    src: r.src?.trim() || undefined,
    sug: r.sug,
    orig: r.orig,
    bex,
    bexJa: r.bexJa,
    form,
    clozeSentence,
    dirs: computeDirs({ m, en, form }),
    mShort: capText(m ?? '', 40),
    mKeys: meaningKeys(m),
    enKeys: defKeys(en),
    key: wordKey(r.w),
    searchText: [m, en].filter(Boolean).join(' | ').toLowerCase(),
  };
}

const listCache = new Map<string, Promise<StudyItem[]>>();

function getBuiltin(meta: ListMeta): Promise<StudyItem[]> {
  let p = listCache.get(meta.id);
  if (!p) {
    p = fetchJson<{ items: RawItem[] }>(`data/list/${meta.id}.json`).then((raw) =>
      raw.items.map((r) => makeItem(meta.id, meta.group, r))
    );
    listCache.set(meta.id, p);
  }
  return p;
}

export function wordRowToItem(r: WordRow, twin?: StudyItem): StudyItem {
  if (!twin) return makeItem(r.listId, 'mine', r);
  // Her meaning and notes win; the built-in entry fills in definition and example.
  return makeItem(r.listId, 'mine', {
    ...r,
    en: r.en ?? twin.en,
    pos: r.pos ?? twin.pos,
    bex: twin.ex,
    bexJa: twin.exJa,
  });
}

let twinIndex: Promise<(w: string) => StudyItem | undefined> | null = null;

/**
 * Finds the built-in entry for one of her words — same word, or an inflected
 * form of it ("Incarcerated" → incarcerate, "Lurking" → lurk).
 */
function getTwinFinder(): Promise<(w: string) => StudyItem | undefined> {
  return (twinIndex ??= getBuiltinItems().then((all) => {
    const byKey = new Map<string, StudyItem>();
    const byPrefix = new Map<string, StudyItem[]>();
    for (const it of all) {
      byKey.set(it.key, it);
      const p = it.key.slice(0, 4);
      if (!byPrefix.has(p)) byPrefix.set(p, []);
      byPrefix.get(p)!.push(it);
    }
    return (w: string) => {
      const key = wordKey(w);
      const exact = byKey.get(key);
      if (exact) return exact;
      if (/\s/.test(key) || key.length < 5) return undefined;
      return byPrefix.get(key.slice(0, 4))?.find((b) => !/\s/.test(b.w) && findForm(b.w, key, false)?.toLowerCase() === key);
    };
  }));
}

/** Every item in a list, built-in or her own. Own lists are read fresh each time. */
export async function getList(meta: ListMeta): Promise<StudyItem[]> {
  if (meta.group !== 'mine') return getBuiltin(meta);
  const [rows, twin] = await Promise.all([db.words.where('listId').equals(meta.id).sortBy('idx'), getTwinFinder()]);
  return rows.map((r) => wordRowToItem(r, twin(r.w)));
}

/** Her own lists, shaped like the built-in index entries. */
export async function getMyLists(): Promise<ListMeta[]> {
  const decks = await db.decks.orderBy('createdAt').toArray();
  return decks.map((d) => ({ id: d.id, group: 'mine', title: d.title, count: d.count }));
}

/** Every item from every list, for search and as a distractor pool. */
export async function getAllItems(): Promise<StudyItem[]> {
  const idx = await getListsIndex();
  const builtin = await Promise.all(idx.lists.map(getBuiltin));
  const twin = await getTwinFinder();
  const mine = (await db.words.toArray()).map((r) => wordRowToItem(r, twin(r.w)));
  return [...builtin.flat(), ...mine];
}

/** Built-in items only (cached) — used to pad distractors for small lists of her own. */
export async function getBuiltinItems(): Promise<StudyItem[]> {
  const idx = await getListsIndex();
  return (await Promise.all(idx.lists.map(getBuiltin))).flat();
}
