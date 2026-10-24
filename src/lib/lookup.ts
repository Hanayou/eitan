import type { WordRow } from './types';
import { db } from './db';
import { editDistance, findForm } from './cloze';

/**
 * Online enrichment for her own words, using Wiktionary's REST API (free, no
 * key, CORS-enabled, and good on slang and phrases). Fills in an English
 * definition, part of speech, and — when she didn't record a sentence — a
 * dictionary example that becomes a fill-in-the-blank question.
 */

interface WikiDef {
  definition: string;
  examples?: string[];
  parsedExamples?: { example: string }[];
}
interface WikiEntry {
  partOfSpeech: string;
  definitions: WikiDef[];
}

const POS: Record<string, string> = { Verb: 'v', Noun: 'n', Adjective: 'adj', Adverb: 'adv', Phrase: 'phr', Idiom: 'phr', Interjection: 'phr' };

/** Wiktionary returns HTML fragments — keep just the text. */
function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, sup').forEach((el) => el.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Definitions that only point at another entry aren't useful as quiz prompts. */
const POINTER = /^(alternative|obsolete|archaic|misspelling|eye dialect|nonstandard|plural|simple past|past participle|present participle|third-person|comparative|superlative|abbreviation|initialism|synonym) /i;

async function fetchEntries(word: string): Promise<WikiEntry[] | null> {
  const url = (w: string) =>
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.trim().replace(/\s+/g, '_'))}`;
  let res = await fetch(url(word));
  // Sheets often have a capitalised first letter — retry lowercase.
  if (res.status === 404 && word !== word.toLowerCase()) res = await fetch(url(word.toLowerCase()));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Dictionary error ${res.status}`);
  return ((await res.json()) as Record<string, WikiEntry[]>).en ?? [];
}

/**
 * Wiktionary's "did you mean" for a word it doesn't have. Only returned when
 * it's a plausible typo fix (a couple of letters off), not a different word.
 */
const API = 'https://en.wiktionary.org/w/api.php';

async function api<T>(params: Record<string, string>): Promise<T | null> {
  const res = await fetch(`${API}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`);
  return res.ok ? ((await res.json()) as T) : null;
}

/** The typos learners make most: a missed double letter, swapped neighbours, one extra letter. */
export function commonTypoFixes(w: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < w.length; i++) {
    if (/[a-z]/.test(w[i])) out.add(w.slice(0, i + 1) + w[i] + w.slice(i + 1)); // grining → grinning
    if (i + 1 < w.length) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)); // recieve → receive
    out.add(w.slice(0, i) + w.slice(i + 1)); // boundle → bundle
  }
  out.delete(w);
  return [...out].filter((x) => x.length >= 3);
}

/** Which of these titles exist on Wiktionary (any language). */
async function existing(titles: string[]): Promise<string[]> {
  if (!titles.length) return [];
  const data = await api<{ query?: { pages?: Record<string, { title: string; missing?: string }> } }>({
    action: 'query',
    titles: titles.slice(0, 50).join('|'),
  });
  return Object.values(data?.query?.pages ?? {})
    .filter((p) => p.missing === undefined)
    .map((p) => p.title);
}

/** Same letters, different order — "graditute" and "gratitude". */
function sameLetters(a: string, b: string): boolean {
  return [...a].sort().join('') === [...b].sort().join('');
}

/**
 * A plausible typo fix for a word Wiktionary doesn't have, or undefined.
 * Candidates come from (a) the common learner typos above, checked for
 * existence, (b) Wiktionary's fuzzy title search and "did you mean"; then
 * they're ranked by closeness and must have an English entry. A candidate
 * that is itself only "obsolete/alternative spelling of X" is replaced by X.
 */
export async function suggestSpelling(word: string): Promise<string | undefined> {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim();
  const lw = norm(word);
  const words = lw.split(/\s+/);
  const single = words.length === 1;

  const [typos, open, search] = await Promise.all([
    single ? existing(commonTypoFixes(lw)) : Promise.resolve([] as string[]),
    api<[string, string[]]>({ action: 'opensearch', search: word, profile: 'fuzzy', namespace: '0', limit: '10' }),
    api<{ query?: { searchinfo?: { suggestion?: string } } }>({
      action: 'query',
      list: 'search',
      srsearch: word,
      srinfo: 'suggestion',
      srlimit: '1',
    }),
  ]);
  const titles = [...typos, ...(open?.[1] ?? []), search?.query?.searchinfo?.suggestion ?? ''].filter(Boolean);

  const allowed = Math.max(1, Math.min(3, Math.floor(lw.replace(/\s/g, '').length / 4)));
  const seen = new Set<string>();
  const ranked: { d: number; t: string; bonus: number }[] = [];
  for (const t of titles) {
    const lt = norm(t);
    if (lt === lw || seen.has(lt) || /[^\x00-\x7f’]/.test(t)) continue; // same word, dup, or accented foreign entry
    seen.add(lt);
    // a phrase may only have one of its words corrected ("rear place" ≠ "real plane")
    const tw = lt.split(/\s+/);
    if (tw.length !== words.length || tw.filter((x, i) => x !== words[i]).length > 1) continue;
    const d = editDistance(lt, lw);
    if (d > allowed) continue;
    let bonus = 0;
    // learners often miss a doubled letter (grining → grinning, assasin → assassin)
    for (let i = 1; i < lt.length; i++) {
      if (lt[i] === lt[i - 1] && lt.slice(0, i) + lt.slice(i + 1) === lw) bonus = 2;
    }
    if (!bonus && sameLetters(lt.replace(/\s/g, ''), lw.replace(/\s/g, ''))) bonus = 1;
    ranked.push({ d, t: lt, bonus });
  }
  ranked.sort((a, b) => a.d - b.d || b.bonus - a.bonus || b.t.length - a.t.length);

  // Wiktionary covers every language — only offer words with a real English entry
  for (const r of ranked.slice(0, 5)) {
    const entries = await fetchEntries(r.t).catch(() => null);
    if (!entries?.length) continue;
    const first = entries.flatMap((e) => e.definitions.map((d) => plain(d.definition))).find(Boolean) ?? '';
    const target = /^(?:obsolete|archaic|alternative|nonstandard|rare)[\w\s-]*? (?:spelling|form) of ([a-z' -]+?)\.?$/i.exec(first)?.[1];
    return target && editDistance(norm(target), lw) <= allowed + 1 ? target : r.t;
  }
  return undefined;
}

const MISSPELLING = /^(?:common )?misspelling of ([\w' -]+?)\.?$/i;

/**
 * The dictionary-friendly core of a phrase as she noted it:
 * "Urge to" → "urge", "obtained by ~ing" → "obtained by", "my composure" →
 * "composure", "nither A or B" → "nither". Returns null if nothing changes.
 */
export function simplifyPhrase(w: string): string | null {
  const s = w
    .toLowerCase()
    .replace(/[~〜～]\w*/g, ' ')
    .replace(/\b(sb|sth|someone|something|[AB])\b.*$/i, ' ')
    .replace(/^(my|your|his|her|our|their|the|a|an|super|so|very|it'?s|i'?m)\s+/i, '')
    .replace(/\s+(to|that|with|for|of|by|on)\s*$/i, '')
    .replace(/[^a-z' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // drop a trailing particle left behind by the steps above ("obtained by ~ing" → "obtained by" is fine; "or" isn't)
  const out = s.replace(/\s+(or|and)$/, '').trim();
  return out && out !== w.toLowerCase().trim() ? out : null;
}

export async function lookupWord(row: WordRow): Promise<WordRow> {
  const next: WordRow = { ...row, looked: 1 };
  let entries = await fetchEntries(row.w);
  const simple = simplifyPhrase(row.w);
  if (!entries && simple) entries = await fetchEntries(simple);
  if (!entries) {
    // suggest a fix for the whole phrase, or for its core within the phrase
    const whole = await suggestSpelling(row.w);
    if (whole) next.sug = whole;
    else if (simple) {
      const core = await suggestSpelling(simple);
      if (core) {
        const i = row.w.toLowerCase().indexOf(simple);
        next.sug = i >= 0 ? row.w.slice(0, i) + core + row.w.slice(i + simple.length) : core;
      }
    }
    return next;
  }

  // "simple past of relinquish", "alternative spelling of low-key" → look up the base word instead
  let target: string | undefined;
  for (let hop = 0; hop < 2 && entries; hop++) {
    target = undefined;
    outer: for (const e of entries) {
      for (const d of e.definitions) {
        const def = plain(d.definition);
        if (!def) continue;
        if (POINTER.test(def) || MISSPELLING.test(def)) {
          target ??= / of ([\w' -]+?)\.?(?:\s*[:;(]|$)/.exec(def)?.[1];
          // Wiktionary has pages for common typos ("definately") — offer the fix
          const typo = MISSPELLING.exec(def)?.[1];
          if (typo && hop === 0) next.sug ??= typo;
          continue;
        }
        if (!next.en) next.en = def.length > 140 ? def.slice(0, 139) + '…' : def;
        if (!next.pos && POS[e.partOfSpeech]) next.pos = POS[e.partOfSpeech];
        break outer;
      }
    }
    if (next.en || !target) break;
    const base = await fetchEntries(target);
    if (!base) break;
    entries = [...entries, ...base];
  }
  entries ??= [];
  if (!next.dex) {
    const examples = entries.flatMap((e) =>
      e.definitions.flatMap((d) => [...(d.examples ?? []), ...(d.parsedExamples ?? []).map((p) => p.example)])
    );
    for (const html of examples) {
      const ex = plain(html);
      if (ex.length <= 160 && findForm(row.w, ex)) {
        next.dex = ex;
        break;
      }
    }
  }
  return next;
}

/** Look up every word in a deck that hasn't been looked up yet. */
export async function enrichDeck(
  listId: string,
  onProgress: (done: number, total: number) => void,
  shouldStop: () => boolean
): Promise<number> {
  const rows = (await db.words.where('listId').equals(listId).toArray()).filter((r) => !r.looked);
  let found = 0;
  let done = 0;
  let next = 0;
  // a few lookups in flight at once — a whole sheet takes ~1 min instead of ~3
  const worker = async () => {
    while (next < rows.length && !shouldStop()) {
      const row = rows[next++];
      try {
        const updated = await lookupWord(row);
        if (updated.en && !row.en) found++;
        await db.words.put(updated);
      } catch {
        /* network hiccup — leave it unlooked so the next run retries */
      }
      onProgress(++done, rows.length);
    }
  };
  onProgress(0, rows.length);
  await Promise.all(Array.from({ length: 4 }, worker));
  return found;
}
