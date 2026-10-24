import { useEffect, useRef, useState } from 'preact/hooks';
import type { ListMeta, StudyItem } from '../lib/types';
import { db, deleteDeck, resetRun, type DeckRow, type ProgressRow, type RunRow } from '../lib/db';
import { getList } from '../lib/data';
import { DIR_LABELS } from '../lib/facets';
import { loadSettings } from '../lib/settings';
import { fixWord, syncDeck } from '../lib/importer';
import { enrichDeck } from '../lib/lookup';
import { DetailModal } from '../components/DetailModal';

const CHUNK = 150;

function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function ListDetailView({
  list,
  active,
  onStart,
  onExit,
  onRepaste,
  onChanged,
  onDeleted,
}: {
  list: ListMeta;
  active: boolean;
  onStart(): void;
  onExit(): void;
  onRepaste(deck: DeckRow): void;
  onChanged(meta: ListMeta): void;
  onDeleted(): void;
}) {
  const [items, setItems] = useState<StudyItem[] | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [rows, setRows] = useState<Map<string, ProgressRow>>(new Map());
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [visible, setVisible] = useState(CHUNK);
  const [detail, setDetail] = useState<StudyItem | null>(null);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const stopLookup = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const settings = useRef(loadSettings());
  const mine = list.group === 'mine';

  const load = async () => {
    settings.current = loadSettings();
    const [its, r, prog, d] = await Promise.all([
      getList(list),
      db.runs.get(list.id),
      db.progress.where('listId').equals(list.id).toArray(),
      mine ? db.decks.get(list.id) : Promise.resolve(undefined),
    ]);
    setItems(its);
    setRun(r ?? null);
    setRows(new Map(prog.map((p) => [p.itemId, p])));
    setDeck(d ?? null);
  };

  // Read-only load — a run is only created when the quiz actually starts.
  useEffect(() => {
    if (active) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.id, active]);

  useEffect(() => () => void (stopLookup.current = true), []);

  // Long lists render in chunks as you scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) setVisible((v) => v + CHUNK);
      },
      { rootMargin: '900px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items, visible]);

  const note = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(''), 4000);
  };

  const quiz = items?.filter((it) => it.dirs.length > 0) ?? [];
  const blocked = (items?.length ?? 0) - quiz.length;
  const max = run?.maxPer ?? settings.current.maxPer;
  const doneCount = quiz.reduce((s, it) => s + (rows.get(it.id)?.done ? 1 : 0), 0);
  const pct = run && run.total ? Math.floor((run.points / run.total) * 100) : 0;
  const complete = !!items && !!run && quiz.length > 0 && doneCount >= quiz.length;
  const needsLookup = mine && items ? items.some((it) => !it.en) : false;

  const rotation = new Set<string>();
  if (items && !complete) {
    for (const it of quiz) {
      if (rotation.size >= settings.current.wsSize) break;
      if (!rows.get(it.id)?.done) rotation.add(it.id);
    }
  }

  const doReset = async () => {
    if (!confirm(`Reset ${list.title}? All progress for this list will be wiped.`)) return;
    await resetRun(list.id);
    setRun(null);
    setRows(new Map());
  };

  const doSync = async () => {
    if (!deck) return;
    setBusy('Syncing…');
    try {
      const n = await syncDeck(deck);
      note(`Synced ✓ ${n} words`);
      onChanged({ ...list, count: n });
    } catch (e) {
      note((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const doLookup = async () => {
    if (!navigator.onLine) {
      note('You’re offline — dictionary lookup needs a connection.');
      return;
    }
    stopLookup.current = false;
    setBusy('Looking up…');
    try {
      const found = await enrichDeck(
        list.id,
        (d, t) => setBusy(`Looking up… ${d}/${t}`),
        () => stopLookup.current
      );
      note(found ? `Added definitions for ${found} words ✓` : 'No new definitions found.');
      await load();
    } catch (e) {
      note((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const applyFix = async (it: StudyItem, spelling: string) => {
    await fixWord(list.id, it.id, spelling);
    await load();
  };

  const editSpelling = async (it: StudyItem) => {
    const next = prompt('Correct spelling (the app remembers this when you sync):', it.w);
    if (next === null || !next.trim() || next.trim() === it.w) return;
    setDetail(null);
    await applyFix(it, next);
    note(`Fixed ✓ Tap 辞書で調べる to look up “${next.trim()}”.`);
  };

  const sugs = mine && items ? items.filter((it) => it.sug) : [];

  const doDelete = async () => {
    if (!confirm(`Delete “${list.title}” from this app? (Your Google Sheet is not touched.)`)) return;
    await deleteDeck(list.id);
    onDeleted();
  };

  return (
    <div class="ld">
      <header class="quiz-head">
        <button type="button" class="icon-btn" onClick={onExit} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="quiz-title">
          <div class="quiz-title-main">{list.title}</div>
          <div class="quiz-title-sub">
            {doneCount}/{quiz.length || list.count} words · {pct}% · {max} per direction
          </div>
        </div>
      </header>
      <div class="quiz-bar">
        <div class="quiz-bar-fill" style={`width:${pct}%`} />
      </div>

      <div class="ld-actions">
        {complete ? (
          <>
            <span class="ld-complete">🎉 List complete!</span>
            <button type="button" class="btn btn-small btn-danger-ghost" onClick={doReset}>
              Reset
            </button>
          </>
        ) : (
          <button type="button" class="btn btn-primary btn-start" onClick={onStart} disabled={!quiz.length}>
            {run ? 'Continue studying' : 'Start studying'}
          </button>
        )}
      </div>

      {mine && deck && (
        <div class="ld-mine">
          <div class="ld-mine-row">
            {deck.url ? (
              <button type="button" class="btn btn-small" onClick={doSync} disabled={!!busy}>
                ⟳ Sync sheet
              </button>
            ) : (
              <button type="button" class="btn btn-small" onClick={() => onRepaste(deck)} disabled={!!busy}>
                Paste update
              </button>
            )}
            {needsLookup && (
              <button type="button" class="btn btn-small" onClick={doLookup} disabled={!!busy}>
                <span lang="ja">辞書で調べる</span>
              </button>
            )}
            {busy.startsWith('Looking') && (
              <button type="button" class="btn btn-small" onClick={() => (stopLookup.current = true)}>
                Stop
              </button>
            )}
            <span class="ld-mine-spacer" />
            <button type="button" class="btn btn-small btn-danger-ghost" onClick={doDelete} disabled={!!busy}>
              Delete
            </button>
          </div>
          <div class="ld-mine-sub muted">
            {busy || flash || (deck.url ? `Synced ${ago(deck.syncedAt)}` : `Imported ${ago(deck.syncedAt)}`)}
            {!busy && !flash && blocked > 0 && (
              <span lang="ja"> · {blocked}語は意味・例文がなく出題できません</span>
            )}
          </div>
        </div>
      )}

      {sugs.length > 0 && (
        <div class="ld-sugs">
          <div class="ld-sugs-title" lang="ja">
            辞書に見つからなかった語 — もしかして？
          </div>
          {sugs.map((it) => (
            <div class="ld-sug" key={it.id}>
              <s>{it.w}</s>→<b>{it.sug}</b>
              <button type="button" class="btn btn-small" onClick={() => applyFix(it, it.sug!)}>
                Fix
              </button>
            </div>
          ))}
        </div>
      )}

      <div class="ld-scroll">
        {!items ? (
          <div class="page-center muted">Loading…</div>
        ) : (
          <>
            <div class="ld-dirhead" aria-hidden="true">
              <span class="ld-legend">{rotation.size > 0 ? 'in rotation' : ''}</span>
              {DIR_LABELS.map((l) => (
                <span lang="ja">{l}</span>
              ))}
            </div>
            <div class="ld-rows">
              {items.slice(0, visible).map((it) => {
                const row = rows.get(it.id);
                const done = row?.done === 1;
                return (
                  <button
                    type="button"
                    class={`ld-row${done ? ' ld-done' : ''}${it.dirs.length ? '' : ' ld-blocked'}`}
                    key={it.id}
                    onClick={() => setDetail(it)}
                  >
                    <span class="ld-left">
                      {rotation.has(it.id) && <span class="ld-dot" />}
                      <span class="ld-text">{it.w}</span>
                      <span class="ld-kana" lang="ja">
                        {it.m || it.en || '—'}
                      </span>
                    </span>
                    {[0, 1, 2, 3].map((d) => {
                      const on = it.dirs.includes(d);
                      const v = Math.min(row?.c[d] ?? 0, max);
                      const p = on && max ? (v / max) * 100 : 0;
                      return (
                        <span
                          class={`ld-cell${!on ? ' ld-off' : v >= max ? ' ld-full' : ''}`}
                          style={
                            on && v > 0 && v < max
                              ? `background:linear-gradient(to top, var(--cell-fill) ${p}%, transparent ${p}%)`
                              : undefined
                          }
                        >
                          {on ? v : '·'}
                        </span>
                      );
                    })}
                  </button>
                );
              })}
            </div>
            {items.length === 0 && <div class="page-center muted">No words in this list yet.</div>}
            {visible < items.length && (
              <div ref={sentinel} class="ld-sentinel muted">
                …
              </div>
            )}
          </>
        )}
      </div>

      {detail && (
        <DetailModal item={detail} onClose={() => setDetail(null)} onEdit={mine ? editSpelling : undefined} />
      )}
    </div>
  );
}
