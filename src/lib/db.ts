import Dexie, { type Table } from 'dexie';
import type { StudyItem, WordRow } from './types';

/**
 * One row per started list ("run"). maxPer is locked in when the list is
 * started and only changes by resetting the list.
 */
export interface RunRow {
  listId: string;
  startedAt: number;
  maxPer: number;
  /** Total points achievable: Σ per item (active directions × maxPer). */
  total: number;
  /** Points earned so far. */
  points: number;
  doneGroups: number;
  finishedAt?: number;
}

/** Per-item progress, FK to the item by (listId, itemId). */
export interface ProgressRow {
  listId: string;
  itemId: string;
  /** Item's position in the list, for working-set ordering. */
  idx: number;
  /** Correct-answer counts per direction (see DIRS in facets.ts). */
  c: number[];
  done: 0 | 1;
}

export type Column = 'w' | 'm' | 'ex' | 'exJa' | 'src' | 'note' | '';

/** One of her own lists, imported from a sheet or pasted cells. */
export interface DeckRow {
  id: string;
  title: string;
  createdAt: number;
  syncedAt: number;
  count: number;
  /** Google Sheets link to re-sync from; absent for pasted/file imports. */
  url?: string;
  /** Column role by column index. */
  map: Column[];
  header: boolean;
  /** Spelling corrections made in the app: wordKey(sheet spelling) → corrected word. */
  fixes?: Record<string, string>;
}

class EitanDB extends Dexie {
  runs!: Table<RunRow, string>;
  progress!: Table<ProgressRow, [string, string]>;
  words!: Table<WordRow, [string, string]>;
  decks!: Table<DeckRow, string>;

  constructor() {
    super('eitan');
    this.version(1).stores({
      runs: 'listId',
      progress: '[listId+itemId], listId',
      words: '[listId+id], listId',
      decks: 'id, createdAt',
    });
  }
}

export const db = new EitanDB();

/** Items that have at least one quiz direction (a word with no meaning/example can't be asked). */
export function quizzable(items: StudyItem[]): StudyItem[] {
  return items.filter((it) => it.dirs.length > 0);
}

/**
 * Load (or create) the run for a list plus all its progress rows.
 * Aggregates on the run row are recomputed from the rows so they stay honest
 * even if the list changed (her sheet was re-synced, or app data updated).
 */
export async function openRun(
  listId: string,
  items: StudyItem[],
  defaultMaxPer: number
): Promise<{ run: RunRow; rowById: Map<string, ProgressRow> }> {
  let run = await db.runs.get(listId);
  if (!run) {
    run = {
      listId,
      startedAt: Date.now(),
      maxPer: defaultMaxPer,
      total: 0,
      points: 0,
      doneGroups: 0,
    };
  }
  const existing = await db.progress.where('listId').equals(listId).toArray();
  const rowById = new Map(existing.map((r) => [r.itemId, r]));

  const missing: ProgressRow[] = [];
  items.forEach((it, idx) => {
    const row = rowById.get(it.id);
    if (!row) {
      const fresh: ProgressRow = { listId, itemId: it.id, idx, c: [0, 0, 0, 0], done: 0 };
      missing.push(fresh);
      rowById.set(it.id, fresh);
    } else if (row.idx !== idx) {
      row.idx = idx;
    }
  });

  let total = 0;
  let points = 0;
  let doneGroups = 0;
  for (const it of items) {
    total += it.dirs.length * run.maxPer;
    const row = rowById.get(it.id)!;
    let p = 0;
    for (const d of it.dirs) p += Math.min(row.c[d] ?? 0, run.maxPer);
    points += p;
    const done = it.dirs.every((d) => (row.c[d] ?? 0) >= run!.maxPer);
    row.done = done ? 1 : 0;
    if (done) doneGroups++;
  }
  run.total = total;
  run.points = points;
  run.doneGroups = doneGroups;
  if (items.length && doneGroups >= items.length) run.finishedAt ??= Date.now();
  else delete run.finishedAt;

  await db.transaction('rw', db.runs, db.progress, async () => {
    await db.runs.put(run!);
    if (missing.length) await db.progress.bulkPut(missing);
  });
  return { run, rowById };
}

export async function resetRun(listId: string) {
  await db.transaction('rw', db.runs, db.progress, async () => {
    await db.progress.where('listId').equals(listId).delete();
    await db.runs.delete(listId);
  });
}

export async function resetAll() {
  await db.transaction('rw', db.runs, db.progress, async () => {
    await db.progress.clear();
    await db.runs.clear();
  });
}

export async function deleteDeck(listId: string) {
  await db.transaction('rw', [db.runs, db.progress, db.words, db.decks], async () => {
    await db.progress.where('listId').equals(listId).delete();
    await db.runs.delete(listId);
    await db.words.where('listId').equals(listId).delete();
    await db.decks.delete(listId);
  });
}

export async function persistAnswer(row: ProgressRow, run: RunRow) {
  await db.transaction('rw', db.runs, db.progress, async () => {
    await db.progress.put({ ...row });
    await db.runs.put({ ...run });
  });
}
