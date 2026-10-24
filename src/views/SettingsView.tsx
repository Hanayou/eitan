import { useEffect, useState } from 'preact/hooks';
import type { ListsIndex, WordRow } from '../lib/types';
import { db, resetAll, resetRun, type DeckRow, type ProgressRow, type RunRow } from '../lib/db';
import { getListsIndex } from '../lib/data';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../lib/settings';
import { canSpeak, speak } from '../lib/speech';

const APP_VERSION = '1.0.0';

interface Backup {
  app: 'eitan';
  v: 1;
  date: string;
  settings: Settings;
  runs: RunRow[];
  progress: ProgressRow[];
  decks: DeckRow[];
  words: WordRow[];
}

export function SettingsView({ active, onRestored }: { active: boolean; onRestored(): void }) {
  const [s, setS] = useState<Settings>(loadSettings());
  const [index, setIndex] = useState<ListsIndex | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [flash, setFlash] = useState('');

  const refresh = () => {
    db.runs.toArray().then(setRuns);
    db.decks.toArray().then(setDecks);
  };

  useEffect(() => {
    getListsIndex().then(setIndex);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active]);

  const upd = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  };

  const note = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(''), 2500);
  };

  const titleOf = (listId: string) =>
    index?.lists.find((l) => l.id === listId)?.title ?? decks.find((d) => d.id === listId)?.title ?? listId;

  const onResetList = async (listId: string) => {
    if (!confirm(`Reset ${titleOf(listId)}? All progress for this list will be wiped.`)) return;
    await resetRun(listId);
    refresh();
  };

  const onResetAll = async () => {
    if (!confirm('Reset ALL study progress? Your imported words are kept, but every score is wiped.')) return;
    await resetAll();
    refresh();
  };

  const onExport = async () => {
    const backup: Backup = {
      app: 'eitan',
      v: 1,
      date: new Date().toISOString(),
      settings: s,
      runs: await db.runs.toArray(),
      progress: await db.progress.toArray(),
      decks: await db.decks.toArray(),
      words: await db.words.toArray(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(backup));
      note('Backup copied to clipboard ✓');
    } catch {
      note('Clipboard not available');
    }
  };

  const onImport = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      note('Clipboard not available');
      return;
    }
    let backup: Backup;
    try {
      backup = JSON.parse(text);
      if (backup.app !== 'eitan' || !Array.isArray(backup.runs) || !Array.isArray(backup.progress)) {
        throw new Error('bad');
      }
    } catch {
      note('Clipboard does not contain an Eitan backup');
      return;
    }
    if (
      !confirm(
        `Restore backup from ${backup.date.slice(0, 10)}? ` +
          `${backup.runs.length} lists started, ${backup.decks?.length ?? 0} of your own lists. ` +
          `Everything currently in the app will be replaced.`
      )
    )
      return;
    await db.transaction('rw', [db.runs, db.progress, db.decks, db.words], async () => {
      await Promise.all([db.runs.clear(), db.progress.clear(), db.decks.clear(), db.words.clear()]);
      await db.runs.bulkPut(backup.runs);
      await db.progress.bulkPut(backup.progress);
      await db.decks.bulkPut(backup.decks ?? []);
      await db.words.bulkPut(backup.words ?? []);
    });
    if (backup.settings) {
      const next = { ...DEFAULT_SETTINGS, ...backup.settings };
      setS(next);
      saveSettings(next);
    }
    refresh();
    onRestored();
    note('Backup restored ✓');
  };

  return (
    <div class="page">
      <header class="page-head">
        <h1>Settings</h1>
      </header>

      <h2 class="section-title">Quiz</h2>
      <div class="card settings-card">
        <label class="setting">
          <span class="setting-label">
            Auto-advance delay <b>{(s.delayMs / 1000).toFixed(2).replace(/0$/, '')}s</b>
          </span>
          <input
            type="range"
            min="250"
            max="4000"
            step="250"
            value={s.delayMs}
            onInput={(e) => upd({ delayMs: +(e.target as HTMLInputElement).value })}
          />
          <span class="setting-note muted">Fill-in-the-blank questions get an extra 0.8s. Tap anywhere to skip ahead.</span>
        </label>
        <label class="setting">
          <span class="setting-label">
            Words in rotation <b>{s.wsSize}</b>
          </span>
          <input
            type="range"
            min="5"
            max="40"
            step="5"
            value={s.wsSize}
            onInput={(e) => upd({ wsSize: +(e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="setting">
          <span class="setting-label">
            Correct answers per direction <b>{s.maxPer}</b>
          </span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={s.maxPer}
            onInput={(e) => upd({ maxPer: +(e.target as HTMLInputElement).value })}
          />
          <span class="setting-note muted">
            Locked in when a list is first started — resetting a list picks up the new value.
          </span>
        </label>
        {canSpeak() && (
          <label class="setting setting-row">
            <span class="setting-label">
              Read the word aloud after answering
              <span class="setting-note muted">Uses the iPhone’s built-in voice — works offline.</span>
            </span>
            <input
              type="checkbox"
              checked={s.speak}
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                upd({ speak: on });
                if (on) speak('Got it.');
              }}
            />
          </label>
        )}
      </div>

      <h2 class="section-title">Progress</h2>
      <div class="card settings-card">
        {runs.length === 0 && <div class="setting muted">No lists started yet.</div>}
        {runs.map((r) => (
          <div class="setting setting-row" key={r.listId}>
            <span class="setting-label">
              {titleOf(r.listId)}{' '}
              <span class="muted">
                {r.total ? Math.floor((r.points / r.total) * 100) : 0}% · {r.maxPer}/dir
              </span>
            </span>
            <button type="button" class="btn btn-small btn-danger-ghost" onClick={() => onResetList(r.listId)}>
              Reset
            </button>
          </div>
        ))}
        {runs.length > 0 && (
          <div class="setting">
            <button type="button" class="btn btn-danger-ghost" onClick={onResetAll}>
              Reset all progress
            </button>
          </div>
        )}
      </div>

      <h2 class="section-title">Backup</h2>
      <div class="card settings-card">
        <div class="setting setting-row">
          <span class="setting-label">
            Progress & imported words
            <span class="setting-note muted">Copies everything as text — paste it back to restore.</span>
          </span>
          <span class="btn-group">
            <button type="button" class="btn btn-small" onClick={onExport}>
              Copy
            </button>
            <button type="button" class="btn btn-small" onClick={onImport}>
              Restore
            </button>
          </span>
        </div>
        {flash && <div class="setting flash">{flash}</div>}
      </div>

      <h2 class="section-title">About</h2>
      <div class="card settings-card about">
        <p>
          <b>
            <span lang="ja">英単</span> Eitan
          </b>{' '}
          v{APP_VERSION}
          {index ? ` · data ${index.built}` : ''}
          {persisted !== null && (persisted ? ' · storage persisted ✓' : ' · storage not yet persistent')}
        </p>
        <p class="muted">
          Install on iPhone: open in Safari → Share → <b>Add to Home Screen</b>. Everything works offline
          except syncing a Google Sheet and dictionary lookups.
        </p>
        <p class="muted about-credits">
          Built-in word lists and example sentences were written for this app. Dictionary lookups use{' '}
          <a href="https://en.wiktionary.org/" target="_blank" rel="noopener">
            Wiktionary
          </a>{' '}
          (CC BY-SA). The icon’s 英 is from{' '}
          <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener">
            KanjiVG
          </a>{' '}
          (CC BY-SA 3.0). Word lists are an unofficial selection, not endorsed by 日本英語検定協会.
        </p>
      </div>
    </div>
  );
}
