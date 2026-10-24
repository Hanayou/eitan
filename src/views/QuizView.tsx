import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { StudyItem, ListMeta } from '../lib/types';
import { getBuiltinItems, getList } from '../lib/data';
import { openRun, persistAnswer, quizzable, resetRun } from '../lib/db';
import { QuizSession, type Question } from '../lib/engine';
import { promptHint } from '../lib/facets';
import { loadSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import { BLANK } from '../lib/cloze';
import { Drawer } from '../components/Drawer';
import { ItemDetail, Sentence } from '../components/ItemDetail';

/** Her own lists smaller than this borrow wrong answers from the built-in lists. */
const MIN_POOL = 12;

const JA_RE = /[぀-ヿ㐀-鿿]/;

function promptClass(q: Question): string {
  const len = q.promptText.length;
  if (q.prompt === 'w') {
    return `prompt prompt-w ${len <= 10 ? 'sz-l' : len <= 18 ? 'sz-m' : 'sz-s'}`;
  }
  if (q.prompt === 'x' || q.prompt === 'd') return `prompt prompt-x${len > 140 ? ' sz-s' : ''}`;
  return `prompt prompt-m${len > 30 ? ' sz-s' : ''}`;
}

function optStyle(label: string, jp: boolean): string {
  const len = label.length;
  let px;
  if (jp) px = len <= 6 ? 20 : len <= 12 ? 17 : len <= 20 ? 15 : 13.5;
  else px = len <= 12 ? 20 : len <= 20 ? 17 : len <= 30 ? 15 : 13.5;
  return `font-size:${px}px`;
}

export function QuizView({ list, onExit }: { list: ListMeta; onExit(): void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'done' | 'empty'>('loading');
  const [q, setQ] = useState<Question | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [infoItem, setInfoItem] = useState<StudyItem | null>(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });
  const session = useRef<QuizSession | null>(null);
  const itemCount = useRef(0);
  const timer = useRef<number | null>(null);
  const settings = useRef(loadSettings());

  const init = useCallback(async () => {
    setState('loading');
    setChosen(null);
    setQ(null);
    settings.current = loadSettings();
    const items = quizzable(await getList(list));
    itemCount.current = items.length;
    if (!items.length) {
      setState('empty');
      return;
    }
    const pool = items.length < MIN_POOL ? [...items, ...(await getBuiltinItems())] : items;
    const { run, rowById } = await openRun(list.id, items, settings.current.maxPer);
    const s = new QuizSession(items, rowById, run, settings.current.wsSize, Math.random, pool);
    session.current = s;
    if (s.listDone()) {
      setState('done');
      return;
    }
    setQ(s.next());
    setState('ready');
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* not critical */
    }
  }, [list.id]);

  useEffect(() => {
    init();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [init]);

  const advance = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const s = session.current;
    if (!s) return;
    if (s.listDone()) {
      setState('done');
      return;
    }
    setChosen(null);
    setQ(s.next());
  }, []);

  const choose = (i: number) => {
    if (chosen !== null || !q) return;
    const s = session.current!;
    const res = s.answer(q, i);
    setChosen(i);
    setInfoItem(q.item);
    setStats((st) => (res.correct ? { ...st, right: st.right + 1 } : { ...st, wrong: st.wrong + 1 }));
    persistAnswer(res.row, s.run).catch(console.error);
    if (settings.current.speak) speak(q.item.w);
    // Sentences take longer to re-read — give fill-in-the-blank answers a bit more time.
    const extra = q.prompt === 'x' ? 800 : 0;
    timer.current = window.setTimeout(advance, Math.max(250, settings.current.delayMs + extra));
  };

  const doReset = async () => {
    if (!confirm(`Reset ${list.title}? All progress for this list will be wiped.`)) return;
    await resetRun(list.id);
    await init();
  };

  const run = session.current?.run;
  const pct = run && run.total ? Math.floor((run.points / run.total) * 100) : 0;

  const renderPrompt = (q: Question) => {
    if (q.prompt === 'x') {
      const sentence = q.item.clozeSentence ?? '';
      if (chosen !== null) return <Sentence text={sentence} form={q.item.form} />;
      return q.promptText.split(BLANK).map((part, i) => (
        <>
          {i > 0 && <span class="blank" />}
          {part}
        </>
      ));
    }
    return q.promptText;
  };

  return (
    <div class="quiz">
      <header class="quiz-head">
        <button type="button" class="icon-btn" onClick={onExit} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="quiz-title">
          <div class="quiz-title-main">{list.title}</div>
          {run && (
            <div class="quiz-title-sub">
              {run.doneGroups}/{itemCount.current} words · {pct}%
            </div>
          )}
        </div>
        <div class="quiz-stats">
          <span class="stat-right">✓{stats.right}</span>
          <span class="stat-wrong">✗{stats.wrong}</span>
        </div>
      </header>
      <div class="quiz-bar">
        <div class="quiz-bar-fill" style={`width:${pct}%`} />
      </div>

      {state === 'loading' && <div class="quiz-center muted">Loading…</div>}

      {state === 'empty' && (
        <div class="quiz-center">
          <div class="done-panel">
            <p lang="ja">
              出題できる単語がありません。シートに「意味」か「例文」の列を足すか、リスト画面の「辞書で調べる」を使ってください。
            </p>
            <button type="button" class="btn btn-primary" onClick={onExit}>
              Back to list
            </button>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div class="quiz-center">
          <div class="done-panel">
            <div class="done-emoji">🎉</div>
            <h2>List complete!</h2>
            <p class="muted">
              All {itemCount.current} words maxed out
              {run ? ` — ${run.points} points earned.` : '.'}
            </p>
            <button type="button" class="btn btn-primary" onClick={onExit}>
              Back to list
            </button>
            <button type="button" class="btn btn-danger-ghost" onClick={doReset}>
              Reset this list
            </button>
          </div>
        </div>
      )}

      {state === 'ready' && q && (
        <>
          <main class="quiz-main" onClick={chosen !== null ? advance : undefined}>
            <div class="prompt-wrap">
              <div class="prompt-hint" lang="ja">
                {promptHint(q.prompt)}
              </div>
              <div class={promptClass(q)} lang={JA_RE.test(q.promptText) ? 'ja' : undefined}>
                {renderPrompt(q)}
              </div>
            </div>
          </main>
          <div class="opts">
            {q.options.map((o, i) => {
              let cls = 'opt';
              if (chosen !== null) {
                if (i === q.correct) cls += ' opt-correct';
                else if (i === chosen) cls += ' opt-wrong';
                else cls += ' opt-dim';
              }
              const jp = JA_RE.test(o.label);
              return (
                <button
                  type="button"
                  class={cls}
                  style={optStyle(o.label, jp)}
                  lang={jp ? 'ja' : undefined}
                  onClick={() => choose(i)}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div class="drawer-zone">
            <Drawer open={drawerOpen} setOpen={setDrawerOpen}>
              {infoItem ? (
                <ItemDetail item={infoItem} />
              ) : (
                <div class="drawer-empty muted">Answer a question to see details here.</div>
              )}
            </Drawer>
          </div>
        </>
      )}
    </div>
  );
}
