import type { StudyItem } from './types';
import type { ProgressRow, RunRow } from './db';
import { DIRS, optionLabelFor, promptTextFor, type Facet } from './facets';

export interface QuizOption {
  label: string;
  item: StudyItem;
}

export interface Question {
  item: StudyItem;
  dir: number;
  prompt: Facet;
  answer: Facet;
  promptText: string;
  options: QuizOption[];
  correct: number;
}

export interface AnswerResult {
  correct: boolean;
  groupDone: boolean;
  listDone: boolean;
  row: ProgressRow;
}

/**
 * The drill session. Keeps a "working set" of the first `wsSize` unfinished
 * words in list order; maxed-out words retire and the next unfinished word
 * is pulled in. Mutates the run row and progress rows it was given — the
 * caller persists them after each answer.
 *
 * Wrong answers come from `pool` (defaults to the list itself). A small list
 * of her own words passes a pool padded with built-in words so there are
 * always enough plausible options.
 */
export class QuizSession {
  private ws: StudyItem[] = [];
  private cursor = 0;
  private lastItemId: string | null = null;
  private lastAsk: string | null = null;
  private pool: StudyItem[];

  constructor(
    private items: StudyItem[],
    private rowById: Map<string, ProgressRow>,
    public run: RunRow,
    wsSize: number,
    private rng: () => number = Math.random,
    pool?: StudyItem[]
  ) {
    this.pool = pool ?? items;
    while (this.ws.length < wsSize && this.cursor < items.length) {
      const it = items[this.cursor++];
      if (!this.rowById.get(it.id)?.done) this.ws.push(it);
    }
  }

  get workingSetSize(): number {
    return this.ws.length;
  }

  listDone(): boolean {
    return this.ws.length === 0;
  }

  next(): Question | null {
    if (!this.ws.length) return null;
    const pool =
      this.ws.length > 1 && this.lastItemId
        ? this.ws.filter((i) => i.id !== this.lastItemId)
        : this.ws;
    const item = pool[Math.floor(this.rng() * pool.length)];
    const row = this.rowById.get(item.id)!;

    let dirs = item.dirs.filter((d) => (row.c[d] ?? 0) < this.run.maxPer);
    if (dirs.length === 0) dirs = item.dirs; // shouldn't happen; be safe
    if (dirs.length > 1 && this.lastAsk) {
      const fresh = dirs.filter((d) => `${item.id}:${d}` !== this.lastAsk);
      if (fresh.length) dirs = fresh;
    }
    const dir = dirs[Math.floor(this.rng() * dirs.length)];
    this.lastItemId = item.id;
    this.lastAsk = `${item.id}:${dir}`;

    const [prompt, answer] = DIRS[dir];
    const options = this.buildOptions(item, answer);
    const correct = Math.floor(this.rng() * (options.length + 1));
    options.splice(correct, 0, { label: optionLabelFor(item, answer), item });

    return { item, dir, prompt, answer, promptText: promptTextFor(item, prompt), options, correct };
  }

  answer(q: Question, choice: number): AnswerResult {
    const correct = choice === q.correct;
    const row = this.rowById.get(q.item.id)!;
    let groupDone = false;

    if (correct && (row.c[q.dir] ?? 0) < this.run.maxPer) {
      row.c = row.c.slice();
      row.c[q.dir] = (row.c[q.dir] ?? 0) + 1;
      this.run.points++;
      if (q.item.dirs.every((d) => (row.c[d] ?? 0) >= this.run.maxPer)) {
        row.done = 1;
        groupDone = true;
        this.run.doneGroups++;
        this.ws = this.ws.filter((i) => i.id !== q.item.id);
        while (this.cursor < this.items.length) {
          const next = this.items[this.cursor++];
          if (!this.rowById.get(next.id)?.done) {
            this.ws.push(next);
            break;
          }
        }
      }
    }

    const listDone = this.ws.length === 0;
    if (listDone && !this.run.finishedAt) this.run.finishedAt = Date.now();
    return { correct, groupDone, listDone, row };
  }

  /**
   * True when `b` could plausibly also be "correct" for a question about `a`
   * — same word, same meaning — or would render identically.
   */
  private conflicts(a: StudyItem, b: StudyItem, facet: Facet): boolean {
    if (a.key === b.key) return true;
    if (optionLabelFor(a, facet) === optionLabelFor(b, facet)) return true;
    for (const k of a.mKeys) if (b.mKeys.has(k)) return true;
    let shared = 0;
    for (const k of a.enKeys) if (b.enKeys.has(k) && ++shared >= 2) return true;
    return false;
  }

  private usable(target: StudyItem, cand: StudyItem, facet: Facet): boolean {
    if (cand.id === target.id && cand.listId === target.listId) return false;
    if (facet === 'm' && !cand.m) return false;
    return true;
  }

  private buildOptions(target: StudyItem, facet: Facet): QuizOption[] {
    const res: QuizOption[] = [];
    const used = new Set([optionLabelFor(target, facet)]);
    const keys = new Set([target.key]);
    const pool = this.pool;
    const n = pool.length;
    let tries = 0;
    while (res.length < 3 && tries < 120) {
      tries++;
      const cand = pool[Math.floor(this.rng() * n)];
      if (!this.usable(target, cand, facet)) continue;
      const label = optionLabelFor(cand, facet);
      if (used.has(label) || keys.has(cand.key)) continue;
      if (this.conflicts(target, cand, facet)) continue;
      // Same part of speech makes options plausible (as on the real test); relax later.
      if (tries < 60 && target.pos && cand.pos && cand.pos !== target.pos) continue;
      // her own words often have no part of speech — at least keep single words
      // with single words and phrases with phrases, so the shape isn't a giveaway
      if (tries < 80 && facet === 'w' && /\s/.test(target.w) !== /\s/.test(cand.w)) continue;
      used.add(label);
      keys.add(cand.key);
      res.push({ label, item: cand });
    }
    if (res.length < 3) {
      // tiny/homogeneous pool fallback: linear scan, label-distinct only
      for (const cand of pool) {
        if (res.length >= 3) break;
        if (!this.usable(target, cand, facet)) continue;
        const label = optionLabelFor(cand, facet);
        if (used.has(label) || keys.has(cand.key)) continue;
        used.add(label);
        keys.add(cand.key);
        res.push({ label, item: cand });
      }
    }
    return res;
  }
}
