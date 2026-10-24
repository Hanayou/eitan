import { useEffect, useState } from 'preact/hooks';
import type { ListMeta } from './lib/types';
import type { DeckRow } from './lib/db';
import { ListsView } from './views/ListsView';
import { SearchView } from './views/SearchView';
import { SettingsView } from './views/SettingsView';
import { ListDetailView } from './views/ListDetailView';
import { QuizView } from './views/QuizView';
import { ImportView } from './views/ImportView';

type Tab = 'study' | 'search' | 'settings';

function TabIcon({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'study':
      return (
        <svg viewBox="0 0 24 24" width="24" height="24">
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 24 24" width="24" height="24">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" width="24" height="24">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path
            d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9M18.4 18.4l-1.9-1.9M7.5 7.5L5.6 5.6"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      );
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'study', label: 'Study' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' },
];

/** What the import screen is for: a new list, or re-pasting into an existing one. */
type ImportTarget = { deck: DeckRow | null };

export function App() {
  const [tab, setTab] = useState<Tab>('study');
  const [openList, setOpenList] = useState<ListMeta | null>(null);
  const [inQuiz, setInQuiz] = useState(false);
  const [importing, setImporting] = useState<ImportTarget | null>(null);
  // bumped whenever her own lists change so views reload
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const view = (e.state as { view?: string } | null)?.view;
      setImporting(null);
      if (view === 'quiz') {
        setInQuiz(true);
      } else if (view === 'detail') {
        setInQuiz(false);
      } else {
        setInQuiz(false);
        setOpenList(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openDetail = (l: ListMeta) => {
    history.pushState({ view: 'detail', id: l.id }, '');
    setOpenList(l);
  };

  const startQuiz = () => {
    history.pushState({ view: 'quiz' }, '');
    setInQuiz(true);
  };

  const startImport = (deck: DeckRow | null) => {
    history.pushState({ view: 'import' }, '');
    setImporting({ deck });
  };

  const back = () => history.back();

  const onImported = (meta: ListMeta) => {
    setRev((r) => r + 1);
    // replace the import screen with the new list's detail page
    history.replaceState({ view: 'detail', id: meta.id }, '');
    setImporting(null);
    setInQuiz(false);
    setOpenList(meta);
  };

  const onDeleted = () => {
    setRev((r) => r + 1);
    back();
  };

  return (
    <>
      <div class="shell" hidden={!!openList || !!importing}>
        <main class="shell-main">
          <div hidden={tab !== 'study'}>
            <ListsView
              active={!openList && !importing && tab === 'study'}
              rev={rev}
              onOpen={openDetail}
              onImport={() => startImport(null)}
            />
          </div>
          <div hidden={tab !== 'search'}>
            <SearchView rev={rev} />
          </div>
          <div hidden={tab !== 'settings'}>
            <SettingsView active={!openList && tab === 'settings'} onRestored={() => setRev((r) => r + 1)} />
          </div>
        </main>
        <nav class="tabbar">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              class={`tab${tab === t.id ? ' tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <TabIcon tab={t.id} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {openList && (
        <ListDetailView
          key={openList.id + rev}
          list={openList}
          active={!inQuiz && !importing}
          onStart={startQuiz}
          onExit={back}
          onRepaste={startImport}
          onChanged={(meta) => {
            setOpenList(meta);
            setRev((r) => r + 1);
          }}
          onDeleted={onDeleted}
        />
      )}
      {openList && inQuiz && <QuizView list={openList} onExit={back} />}
      {importing && <ImportView deck={importing.deck} onDone={onImported} onExit={back} />}
    </>
  );
}
