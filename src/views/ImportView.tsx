import { useState } from 'preact/hooks';
import type { ListMeta } from '../lib/types';
import type { Column, DeckRow } from '../lib/db';
import {
  fetchSheet,
  guessByContent,
  guessColumns,
  looksLikeHeader,
  parseTable,
  rowsToWords,
  saveDeck,
} from '../lib/importer';

type Source = 'link' | 'paste';

const ROLES: { id: Column; label: string }[] = [
  { id: 'w', label: 'Word / phrase 英語' },
  { id: 'm', label: 'Meaning 意味' },
  { id: 'ex', label: 'Example line 例文' },
  { id: 'exJa', label: 'Example translation 例文訳' },
  { id: 'src', label: 'Anime / episode 作品' },
  { id: 'note', label: 'Note メモ' },
  { id: '', label: '— ignore —' },
];

export function ImportView({
  deck,
  onDone,
  onExit,
}: {
  /** Existing pasted deck to update, or null for a new list. */
  deck: DeckRow | null;
  onDone(meta: ListMeta): void;
  onExit(): void;
}) {
  const [source, setSource] = useState<Source>(deck ? 'paste' : 'link');
  const [link, setLink] = useState('');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [header, setHeader] = useState(deck?.header ?? true);
  const [map, setMap] = useState<Column[]>([]);
  const [title, setTitle] = useState(deck?.title ?? 'My anime words');

  const loadRows = (table: string[][]) => {
    if (!table.length) {
      setError('No rows found.');
      return;
    }
    const width = Math.max(...table.slice(0, 50).map((r) => r.length));
    const hasHeader = deck ? deck.header : looksLikeHeader(table[0]);
    setHeader(hasHeader);
    const body = hasHeader ? table.slice(1) : table;
    setMap(
      deck && deck.map.length
        ? Array.from({ length: width }, (_, i) => deck.map[i] ?? '')
        : guessByContent(
            body,
            hasHeader
              ? guessColumns(Array.from({ length: width }, (_, i) => table[0][i] ?? ''), true)
              : Array.from({ length: width }, () => '' as Column)
          )
    );
    setRows(table);
    setError('');
  };

  const fetchLink = async () => {
    setBusy(true);
    setError('');
    try {
      loadRows(parseTable(await fetchSheet(link)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const readPaste = () => loadRows(parseTable(pasted));

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasted(text);
      loadRows(parseTable(text));
    } catch {
      setError('Clipboard not available — long-press the box and choose Paste.');
    }
  };

  const setRole = (col: number, role: Column) => {
    setMap((m) => m.map((r, i) => (i === col ? role : r === role && role !== '' ? '' : r)));
  };

  const id = deck?.id ?? `mine-${Date.now().toString(36)}`;
  const words = rows ? rowsToWords(id, rows, map, header, deck?.fixes) : [];
  const withMeaning = words.filter((w) => w.m).length;
  const withExample = words.filter((w) => w.ex).length;

  const save = async () => {
    if (!words.length) return;
    setBusy(true);
    const row: DeckRow = {
      id,
      title: title.trim() || 'My words',
      createdAt: deck?.createdAt ?? Date.now(),
      syncedAt: Date.now(),
      count: words.length,
      url: source === 'link' ? link.trim() : deck?.url,
      map,
      header,
      fixes: deck?.fixes,
    };
    await saveDeck(row, words);
    setBusy(false);
    onDone({ id, group: 'mine', title: row.title, count: words.length });
  };

  const width = map.length;
  const preview = rows ? rows.slice(header ? 1 : 0, (header ? 1 : 0) + 4) : [];

  return (
    <div class="ld">
      <header class="quiz-head">
        <button type="button" class="icon-btn" onClick={onExit} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="quiz-title">
          <div class="quiz-title-main">{deck ? `Update ${deck.title}` : 'Add your words'}</div>
          <div class="quiz-title-sub">From Google Sheets</div>
        </div>
      </header>

      <div class="ld-scroll imp">
        {!rows && (
          <>
            {!deck && (
              <div class="seg">
                <button type="button" class={source === 'link' ? 'seg-on' : ''} onClick={() => setSource('link')}>
                  Sheet link
                </button>
                <button type="button" class={source === 'paste' ? 'seg-on' : ''} onClick={() => setSource('paste')}>
                  Paste cells
                </button>
              </div>
            )}

            {source === 'link' ? (
              <div class="card imp-card">
                <p lang="ja" class="imp-help">
                  Googleスプレッドシートで <b>共有 → 一般的なアクセス →「リンクを知っている全員」（閲覧者）</b>
                  にしてから、リンクをコピーして貼り付けてください。あとで「Sync」ボタン一つで新しい単語を取り込めます。
                </p>
                <input
                  class="imp-input"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={link}
                  onInput={(e) => setLink((e.target as HTMLInputElement).value)}
                  autocapitalize="off"
                  autocorrect="off"
                />
                <button type="button" class="btn btn-primary" onClick={fetchLink} disabled={busy || !link.trim()}>
                  {busy ? 'Downloading…' : 'Load sheet'}
                </button>
              </div>
            ) : (
              <div class="card imp-card">
                <p lang="ja" class="imp-help">
                  スプレッドシートアプリで列（見出し行も）を選択してコピーし、下に貼り付けてください。CSVでもOKです。
                </p>
                <textarea
                  class="imp-input imp-textarea"
                  placeholder={'word\tmeaning\texample\nget a grip\t落ち着け\tGet a grip, we still have a chance!'}
                  value={pasted}
                  onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
                  autocapitalize="off"
                  autocorrect="off"
                  spellcheck={false}
                />
                <div class="btn-group">
                  <button type="button" class="btn" onClick={pasteFromClipboard}>
                    Paste from clipboard
                  </button>
                  <button type="button" class="btn btn-primary" onClick={readPaste} disabled={!pasted.trim()}>
                    Next
                  </button>
                </div>
              </div>
            )}
            {error && <p class="imp-error">{error}</p>}
          </>
        )}

        {rows && (
          <>
            <h2 class="section-title">Columns</h2>
            <div class="card settings-card">
              <label class="setting setting-row">
                <span class="setting-label">First row is column titles</span>
                <input type="checkbox" checked={header} onChange={(e) => setHeader((e.target as HTMLInputElement).checked)} />
              </label>
              {Array.from({ length: width }, (_, col) => (
                <label class="setting setting-row" key={col}>
                  <span class="setting-label imp-colname">
                    {header ? rows[0][col] || `Column ${col + 1}` : `Column ${col + 1}`}
                    <span class="setting-note muted">{preview.map((r) => r[col]).filter(Boolean)[0] ?? ''}</span>
                  </span>
                  <select value={map[col]} onChange={(e) => setRole(col, (e.target as HTMLSelectElement).value as Column)}>
                    {ROLES.map((r) => (
                      <option value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <h2 class="section-title">List name</h2>
            <div class="card settings-card">
              <div class="setting">
                <input
                  class="imp-input"
                  value={title}
                  onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                />
              </div>
            </div>

            <h2 class="section-title">Preview</h2>
            <div class="card settings-card">
              {!map.includes('w') ? (
                <div class="setting imp-error">Pick which column holds the English word.</div>
              ) : (
                <>
                  <div class="setting muted">
                    {words.length} words · {withMeaning} with meaning · {withExample} with an example line
                  </div>
                  {words.slice(0, 4).map((w) => (
                    <div class="setting imp-prev" key={w.id}>
                      <b>{w.w}</b>
                      {w.m && <span lang="ja"> — {w.m}</span>}
                      {w.ex && <div class="muted imp-prev-ex">“{w.ex}”</div>}
                    </div>
                  ))}
                </>
              )}
            </div>
            <p class="muted imp-help imp-help-after" lang="ja">
              「意味」がある単語は 英語⇄意味、「例文」に単語が含まれていれば穴埋め問題になります。
              意味がない単語は、取り込み後に「辞書で調べる」で英語の定義と例文を追加できます（要ネット接続）。
            </p>

            <div class="imp-actions">
              <button type="button" class="btn" onClick={() => setRows(null)}>
                Back
              </button>
              <button type="button" class="btn btn-primary btn-start" onClick={save} disabled={busy || !words.length}>
                {deck ? 'Update list' : `Add ${words.length} words`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
