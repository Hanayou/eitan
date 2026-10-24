import type { WordRow } from './types';
import type { Column, DeckRow } from './db';
import { db } from './db';
import { wordKey } from './data';

/** Parse CSV or TSV text into rows of cells. Handles quoted fields with commas/newlines. */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n', 1)[0];
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}

const GUESSES: [Column, RegExp][] = [
  ['exJa', /(例文.*(訳|和訳|日本語))|(sentence|example).*(ja|japanese|translation)|和訳/i],
  ['ex', /例文|example|sentence|line|quote|context|セリフ|台詞|文/i],
  ['w', /^(word|words|phrase|english|vocab|term|expression|英語|英単語|単語|フレーズ|表現)s?$/i],
  ['m', /meaning|definition|japanese|translation|意味|日本語|訳|和訳|定義/i],
  ['src', /anime|source|show|title|genre|episode|ep\b|作品|アニメ|出典|話|ジャンル|番組|タイトル/i],
  ['note', /note|memo|comment|メモ|備考|ノート/i],
];

/**
 * Guess column roles from a header row. Unrecognized columns are ignored ('').
 * With `partial`, a missing word column is left for guessByContent to find.
 */
export function guessColumns(header: string[], partial = false): Column[] {
  const map: Column[] = header.map(() => '');
  const taken = new Set<Column>();
  for (const [role, re] of GUESSES) {
    const i = header.findIndex((h, j) => map[j] === '' && re.test(h.trim()));
    if (i >= 0 && !taken.has(role)) {
      map[i] = role;
      taken.add(role);
    }
  }
  if (!taken.has('w') && !partial) {
    // no obvious word column — take the first column not yet assigned
    const i = map.findIndex((r) => r === '');
    if (i >= 0) map[i] = 'w';
  }
  return map;
}

const HAS_JA = /[぀-ヿ㐀-鿿]/;

/**
 * Guess column roles from what's in them (for sheets without a title row, or
 * columns whose titles weren't recognized): mostly-Japanese → meaning, longer
 * English → example line, short English → the word. `map` holds roles already
 * decided; only '' entries are filled.
 */
export function guessByContent(rows: string[][], map: Column[]): Column[] {
  const out = map.slice();
  const stats = out.map((_, c) => {
    const cells = rows.slice(0, 60).map((r) => (r[c] ?? '').trim()).filter(Boolean);
    const n = cells.length || 1;
    const ja = cells.filter((s) => HAS_JA.test(s)).length / n;
    // count English words outside any Japanese part ("bail - 逃げる" is 1 word)
    const words = cells.reduce((s, x) => s + (x.split(/[぀-ヿ㐀-鿿]/)[0].match(/[A-Za-z']+/g)?.length ?? 0), 0) / n;
    // combined "word – 意味" cells are English-first with Japanese after
    const enFirst = cells.filter((s) => /^[^぀-ヿ㐀-鿿]*[A-Za-z]/.test(s)).length / n;
    return { c, filled: cells.length, ja, words, enFirst };
  });
  const free = () => stats.filter((s) => out[s.c] === '' && s.filled > 0);
  const take = (role: Column, pick: (s: (typeof stats)[number]) => boolean, score: (s: (typeof stats)[number]) => number) => {
    if (out.includes(role)) return;
    const best = free()
      .filter(pick)
      .sort((a, b) => score(b) - score(a) || a.c - b.c)[0];
    if (best) out[best.c] = role;
  };
  // the word: English-first, short; prefer the leftmost such column
  take('w', (s) => s.enFirst >= 0.6 && s.words <= 5, (s) => -s.c);
  // meaning: the most Japanese column that isn't English-first
  take('m', (s) => s.ja >= 0.5 && s.enFirst < 0.5, (s) => s.ja);
  // example line: the wordiest remaining English column
  take('ex', (s) => s.enFirst >= 0.5 && s.words >= 3.5, (s) => s.words);
  // a remaining Japanese column next to the example is probably its translation
  if (out.includes('ex')) take('exJa', (s) => s.ja >= 0.5, (s) => s.ja);
  if (!out.includes('w')) {
    const i = out.findIndex((r) => r === '');
    if (i >= 0) out[i] = 'w';
  }
  return out;
}

/** Heuristic: the first row looks like column titles rather than a vocab entry. */
export function looksLikeHeader(row: string[]): boolean {
  return row.some((c) => GUESSES.some(([, re]) => re.test(c.trim())));
}

/**
 * Turn a Google Sheets link into CSV download URLs to try, in order.
 * The sheet must be shared as "Anyone with the link can view" (or published).
 */
export function sheetCsvUrls(link: string): string[] {
  const url = link.trim();
  if (/output=csv|format=csv|tqx=out:csv/.test(url)) return [url];
  const gid = /[#&?]gid=(\d+)/.exec(url)?.[1];
  const pub = /\/spreadsheets\/d\/e\/([\w-]+)/.exec(url);
  if (pub) {
    return [`https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`];
  }
  const id = /\/spreadsheets\/d\/([\w-]+)/.exec(url)?.[1];
  if (!id) return [];
  return [
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`,
  ];
}

export async function fetchSheet(link: string): Promise<string> {
  const urls = sheetCsvUrls(link);
  if (!urls.length) throw new Error('That doesn’t look like a Google Sheets link.');
  let lastErr = '';
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-store' });
      const text = await res.text();
      // A private sheet answers with a sign-in HTML page instead of CSV.
      if (res.ok && !/^\s*<(!doctype|html)/i.test(text)) return text;
      lastErr = res.ok ? 'not shared' : `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(
    `Couldn’t download the sheet (${lastErr}). In Google Sheets tap Share → General access → ` +
      `“Anyone with the link” (Viewer), then try again — or copy the cells and use Paste instead.`
  );
}

const JA = '぀-ヿ㐀-鿿＀-￯';
const COMBINED = new RegExp(`^([^${JA}]*?[A-Za-z][^${JA}]*?)\\s*[-–—:：=＝→⇒/／|｜]*\\s*([${JA}（「].*)$`);

/**
 * "get a grip – 落ち着け" typed into one cell → ["get a grip", "落ち着け"].
 * Returns null when the cell isn't English followed by Japanese.
 */
export function splitCombined(cell: string): [string, string] | null {
  const m = COMBINED.exec(cell.trim());
  if (!m) return null;
  const en = m[1].trim().replace(/[\s\-–—:：=＝→⇒/／|｜(（]+$/, '');
  const ja = m[2].replace(/^[！!？?。、．・：:\-－ー=＝→\s]+/, '').trim();
  return en && ja ? [en, ja] : null;
}

/**
 * Tidy a word as typed in the sheet: drop quotes around phrases
 * (“No way!” → No way!), turn "finish~off" into "finish off", drop a trailing
 * "Madam~", and lowercase a sentence-style capital ("Exterminate" →
 * "exterminate") so answer buttons don't differ just by capitalisation.
 */
export function cleanWord(w: string): string {
  let s = w
    .replace(/^["“”'‘’「『]+|["“”'‘’」』]+$/g, '')
    .replace(/(\w)[~〜～](\w)/g, '$1 $2')
    .replace(/[~〜～]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const first = s.split(' ')[0];
  if (/^[A-Z]/.test(s) && !/[A-Z]/.test(s.slice(1)) && !/^I(['’](m|ve|ll|d))?$/.test(first)) {
    s = s[0].toLowerCase() + s.slice(1);
  }
  return s;
}

/**
 * Build word rows from parsed table data using a column map. Duplicate words
 * keep the first row. `fixes` maps a sheet spelling (by wordKey) to the
 * corrected spelling she picked in the app, so corrections survive re-syncs.
 */
export function rowsToWords(
  listId: string,
  rows: string[][],
  map: Column[],
  header: boolean,
  fixes: Record<string, string> = {}
): WordRow[] {
  const out: WordRow[] = [];
  const seen = new Set<string>();
  const col = (r: string[], role: Column) => {
    const i = map.indexOf(role);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  for (const r of header ? rows.slice(1) : rows) {
    let w = col(r, 'w');
    let m = col(r, 'm');
    const split = splitCombined(w);
    if (split) {
      w = split[0];
      if (!m) m = split[1];
    }
    w = cleanWord(w);
    const id = wordKey(w);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row: WordRow = { listId, id, idx: out.length, w: fixes[id] ?? w };
    if (fixes[id]) row.orig = w;
    if (m) row.m = m;
    for (const role of ['ex', 'exJa', 'src', 'note'] as const) {
      const v = col(r, role);
      if (v) row[role] = v;
    }
    out.push(row);
  }
  return out;
}

/**
 * Save a deck and its words. On re-sync, dictionary data already looked up
 * for a word is kept, and progress for words that are still present survives.
 */
export async function saveDeck(deck: DeckRow, words: WordRow[]) {
  await db.transaction('rw', [db.decks, db.words, db.progress], async () => {
    const old = await db.words.where('listId').equals(deck.id).toArray();
    const oldById = new Map(old.map((o) => [o.id, o]));
    for (const w of words) {
      const prev = oldById.get(w.id);
      if (prev) {
        if (prev.en) w.en = prev.en;
        if (prev.pos) w.pos = prev.pos;
        if (prev.dex) w.dex = prev.dex;
        if (prev.looked) w.looked = prev.looked;
        if (prev.sug) w.sug = prev.sug;
      }
    }
    const keep = new Set(words.map((w) => w.id));
    const gone = old.filter((o) => !keep.has(o.id)).map((o) => [deck.id, o.id] as [string, string]);
    if (gone.length) {
      await db.words.bulkDelete(gone);
      await db.progress.bulkDelete(gone);
    }
    await db.words.bulkPut(words);
    await db.decks.put({ ...deck, count: words.length, syncedAt: Date.now() });
  });
}

/**
 * Correct a word's spelling in the app. The fix is remembered on the deck so
 * the next sync applies it again; progress is kept (the row id is unchanged).
 */
export async function fixWord(listId: string, id: string, spelling: string) {
  const w = spelling.trim();
  if (!w) return;
  await db.transaction('rw', db.words, db.decks, async () => {
    const row = await db.words.get([listId, id]);
    const deck = await db.decks.get(listId);
    if (!row || !deck) return;
    const orig = row.orig ?? row.w;
    // dictionary data belonged to the old spelling — look it up again
    const { en: _en, pos: _pos, dex: _dex, looked: _l, sug: _s, ...rest } = row;
    await db.words.put({ ...rest, w, orig: w === orig ? undefined : orig });
    const fixes = { ...deck.fixes };
    if (w === orig) delete fixes[id];
    else fixes[id] = w;
    await db.decks.put({ ...deck, fixes });
  });
}

/** Re-download a linked deck and merge it. Returns the new word count. */
export async function syncDeck(deck: DeckRow): Promise<number> {
  if (!deck.url) throw new Error('This list was pasted, not linked — paste the cells again to update it.');
  const rows = parseTable(await fetchSheet(deck.url));
  const words = rowsToWords(deck.id, rows, deck.map, deck.header, deck.fixes);
  if (!words.length) throw new Error('The sheet came back empty — has the word column moved?');
  await saveDeck(deck, words);
  return words.length;
}
