import { useEffect, useRef, useState } from 'preact/hooks';
import type { StudyItem } from '../lib/types';
import { getAllItems, wordKey } from '../lib/data';
import { DetailModal } from '../components/DetailModal';

function score(item: StudyItem, qKey: string, qLower: string): number {
  if (item.key === qKey) return 0;
  if (item.key.startsWith(qKey)) return 1;
  if (item.key.includes(qKey)) return 2;
  if (qLower.length >= 1 && item.searchText.includes(qLower)) return 3;
  return Infinity;
}

export function SearchView({ rev }: { rev: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<StudyItem | null>(null);
  const all = useRef<StudyItem[] | null>(null);
  const debounce = useRef<number | null>(null);

  // her lists changed — reload on the next search
  useEffect(() => {
    all.current = null;
  }, [rev]);

  const run = (raw: string) => {
    const q = raw.trim();
    if (!q || !all.current) {
      setResults([]);
      return;
    }
    const qKey = wordKey(q);
    const qLower = q.toLowerCase();
    const scored: { s: number; item: StudyItem }[] = [];
    for (const item of all.current) {
      const s = score(item, qKey, qLower);
      if (s !== Infinity) scored.push({ s, item });
    }
    scored.sort((a, b) => a.s - b.s || a.item.w.length - b.item.w.length);
    setResults(scored.slice(0, 80).map((x) => x.item));
  };

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      if (!all.current) {
        setLoading(true);
        all.current = await getAllItems();
        setLoading(false);
      }
      run(query);
    }, 140);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div class="page">
      <header class="page-head">
        <h1>Search</h1>
      </header>
      <div class="search-box">
        <svg viewBox="0 0 24 24" width="18" height="18" class="search-icon">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <input
          type="search"
          placeholder="English word or 日本語の意味…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          autocapitalize="off"
          autocorrect="off"
        />
      </div>

      {loading && <div class="page-center muted">Loading…</div>}

      {!loading && query.trim() && results.length === 0 && <div class="page-center muted">No matches.</div>}

      {!loading && !query.trim() && (
        <div class="page-center muted search-hint">
          Search every list, including your own — try “bolster” or <span lang="ja">任せろ</span>.
        </div>
      )}

      <div class="card search-results">
        {results.map((item) => (
          <button type="button" class="result-row" key={`${item.listId}:${item.id}`} onClick={() => setDetail(item)}>
            <span class="result-mid">
              <span class="result-word">{item.w}</span>
              <span class="result-en" lang="ja">
                {item.mShort || item.en}
              </span>
            </span>
            <span class={`badge badge-${item.group}`}>
              {item.group === 'eiken' ? '1級' : item.group === 'anime' ? 'Anime' : 'Mine'}
            </span>
          </button>
        ))}
      </div>

      {detail && <DetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
