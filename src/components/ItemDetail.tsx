import { useEffect, useRef } from 'preact/hooks';
import type { StudyItem } from '../lib/types';
import { splitAround } from '../lib/cloze';
import { canSpeak, speak } from '../lib/speech';

const POS_LABEL: Record<string, string> = {
  v: '動詞',
  adj: '形容詞',
  n: '名詞',
  adv: '副詞',
  phr: '句・表現',
};

/** A sentence with the studied word highlighted. */
export function Sentence({ text, form }: { text: string; form?: string }) {
  const parts = form ? splitAround(text, form) : null;
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark>{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

export function SpeakButton({ text }: { text: string }) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      class="speak-btn"
      aria-label="Listen"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        <path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>
  );
}

/** Full info panel for one item — used by the quiz drawer, list rows, and search. */
export function ItemDetail({ item }: { item: StudyItem }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // content swaps in place while the drawer stays open — show the new item from the top
    if (root.current?.parentElement) root.current.parentElement.scrollTop = 0;
  }, [item]);

  const exForm = item.clozeSentence === item.ex ? item.form : undefined;
  const bexForm = item.clozeSentence === item.bex ? item.form : undefined;
  const dexForm = item.clozeSentence === item.dex ? item.form : undefined;

  return (
    <div class="detail" ref={root}>
      <div class="detail-head">
        <div class="detail-main">
          <div class="detail-text">{item.w}</div>
          <SpeakButton text={item.w} />
        </div>
        {item.pos && POS_LABEL[item.pos] && (
          <span class={`badge badge-${item.group}`} lang="ja">
            {POS_LABEL[item.pos]}
          </span>
        )}
      </div>

      {item.orig && (
        <p class="example-src" lang="ja">
          シートでの表記: {item.orig}
        </p>
      )}
      {item.m && (
        <p class="detail-m" lang="ja">
          {item.m}
        </p>
      )}
      {item.en && <p class="detail-en">{item.en}</p>}
      {item.note && (
        <p class={item.group === 'mine' ? 'detail-memo' : 'detail-note'} lang="ja">
          {item.group === 'mine' && <span class="yomi-label">メモ</span>}
          {item.note}
        </p>
      )}

      {(item.ex || item.bex || item.dex) && (
        <section class="detail-section">
          <h3>Examples</h3>
          {item.ex && (
            <div class="example">
              <div class="example-en-main">
                <Sentence text={item.ex} form={exForm} />
                <SpeakButton text={item.ex} />
              </div>
              {item.exJa && (
                <div class="example-ja-sub" lang="ja">
                  {item.exJa}
                </div>
              )}
              {item.src && <div class="example-src">— {item.src}</div>}
            </div>
          )}
          {item.bex && (
            <div class="example">
              <div class="example-en-main">
                <Sentence text={item.bex} form={bexForm} />
                <SpeakButton text={item.bex} />
              </div>
              {item.bexJa && (
                <div class="example-ja-sub" lang="ja">
                  {item.bexJa}
                </div>
              )}
              <div class="example-src" lang="ja">
                — 英検1級リストの例文
              </div>
            </div>
          )}
          {item.dex && !item.bex && (
            <div class="example">
              <div class="example-en-main">
                <Sentence text={item.dex} form={dexForm} />
                <SpeakButton text={item.dex} />
              </div>
              <div class="example-src">— dictionary example</div>
            </div>
          )}
        </section>
      )}

      {!item.ex && item.src && <p class="example-src">Heard in: {item.src}</p>}

      {item.dirs.length === 0 && (
        <p class="detail-warn" lang="ja">
          意味か例文がないので、まだクイズに出せません。シートに意味を書き足すか、「辞書で調べる」を使ってください。
        </p>
      )}
    </div>
  );
}
