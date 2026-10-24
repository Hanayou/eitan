import { useEffect, useState } from 'preact/hooks';
import type { ListMeta, ListsIndex } from '../lib/types';
import { db, type RunRow } from '../lib/db';
import { getListsIndex, getMyLists } from '../lib/data';

function Chev() {
  return (
    <svg class="chev" viewBox="0 0 24 24" width="18" height="18">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function ListRow({ list, run, onOpen }: { list: ListMeta; run?: RunRow; onOpen(l: ListMeta): void }) {
  const pct = run && run.total ? Math.floor((run.points / run.total) * 100) : 0;
  const finished = !!run?.finishedAt;
  return (
    <button type="button" class="list-row" onClick={() => onOpen(list)}>
      <div class="list-row-left">
        <div class="list-row-title">{list.title}</div>
        <div class="list-row-sub muted">
          {list.sub && <span lang="ja">{list.sub} · </span>}
          {run ? `${run.doneGroups}/${list.count} words` : `${list.count} words`}
        </div>
      </div>
      <div class="list-row-right">
        {finished ? (
          <span class="complete-badge">✓ Complete</span>
        ) : run ? (
          <>
            <span class="list-pct">{pct}%</span>
            <span class="mini-bar">
              <span class="mini-bar-fill" style={`width:${pct}%`} />
            </span>
          </>
        ) : (
          <span class="muted list-new">Not started</span>
        )}
        <Chev />
      </div>
    </button>
  );
}

export function ListsView({
  active,
  rev,
  onOpen,
  onImport,
}: {
  active: boolean;
  rev: number;
  onOpen(l: ListMeta): void;
  onImport(): void;
}) {
  const [index, setIndex] = useState<ListsIndex | null>(null);
  const [mine, setMine] = useState<ListMeta[]>([]);
  const [runs, setRuns] = useState<Map<string, RunRow>>(new Map());

  useEffect(() => {
    getListsIndex().then(setIndex);
  }, []);

  useEffect(() => {
    if (!active) return;
    getMyLists().then(setMine);
    db.runs.toArray().then((rows) => setRuns(new Map(rows.map((r) => [r.listId, r]))));
  }, [active, rev]);

  if (!index) return <div class="page-center muted">Loading…</div>;

  const eiken = index.lists.filter((l) => l.group === 'eiken');
  const anime = index.lists.filter((l) => l.group === 'anime');

  return (
    <div class="page">
      <header class="page-head">
        <h1>
          <span lang="ja">英単</span> <span class="page-head-sub">Eitan</span>
        </h1>
      </header>

      <section>
        <h2 class="section-title">My words</h2>
        <div class="card">
          {mine.map((l) => (
            <ListRow key={l.id} list={l} run={runs.get(l.id)} onOpen={onOpen} />
          ))}
          <button type="button" class="list-row list-row-add" onClick={onImport}>
            <div class="list-row-left">
              <div class="list-row-title">＋ Add from Google Sheets</div>
              <div class="list-row-sub muted" lang="ja">
                アニメで集めた単語・フレーズを取り込む
              </div>
            </div>
            <Chev />
          </button>
        </div>
      </section>

      <section>
        <h2 class="section-title">
          <span lang="ja">英検1級</span>
        </h2>
        <div class="card">
          {eiken.map((l) => (
            <ListRow key={l.id} list={l} run={runs.get(l.id)} onOpen={onOpen} />
          ))}
        </div>
      </section>

      <section>
        <h2 class="section-title">Anime English</h2>
        <div class="card">
          {anime.map((l) => (
            <ListRow key={l.id} list={l} run={runs.get(l.id)} onOpen={onOpen} />
          ))}
        </div>
      </section>
    </div>
  );
}
