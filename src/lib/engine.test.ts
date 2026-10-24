import { describe, expect, it } from 'vitest';
import { blankOut, findForm, BLANK } from './cloze';
import { cleanWord, guessByContent, guessColumns, looksLikeHeader, parseTable, rowsToWords, sheetCsvUrls, splitCombined } from './importer';
import { makeItem, meaningKeys } from './data';
import { commonTypoFixes, simplifyPhrase } from './lookup';
import { QuizSession } from './engine';
import type { ProgressRow, RunRow } from './db';

describe('findForm', () => {
  it('finds regular inflections', () => {
    expect(findForm('relinquish', 'She relinquished the title.')).toBe('relinquished');
    expect(findForm('abate', 'The storm is abating now.')).toBe('abating');
    expect(findForm('rely', 'We relied on him.')).toBe('relied');
    expect(findForm('abet', 'He abetted the thief.')).toBe('abetted');
    expect(findForm('panic', 'They panicked.')).toBe('panicked');
    expect(findForm('Bolster', 'It bolsters morale.')).toBe('bolsters');
  });
  it('matches whole words only', () => {
    expect(findForm('cat', 'A category error.')).toBeNull();
    expect(findForm('dork', 'You dork!')).toBe('dork');
  });
  it('handles phrases, apostrophes and placeholders', () => {
    expect(findForm("I've got your back", 'Relax — I’ve got your back.')).toBe('I’ve got your back');
    expect(findForm('get on one’s nerves', 'That noise gets on my nerves.')).toBe('gets on my nerves');
    expect(findForm('iron out', 'We ironed out the details.')).toBe('ironed out');
    expect(findForm('cut someone some slack', 'Cut him some slack, okay?')).toBe('Cut him some slack');
  });
  it('forgives small typos in her sheet', () => {
    expect(findForm('recklesly', 'He charged recklessly into the dungeon.')).toBe('recklessly');
    expect(findForm("your gonna regret this", "You're gonna regret this, I swear.")).toBe("You're gonna regret this");
    expect(findForm('dont push your luck', "Don't push your luck, kid.")).toBe("Don't push your luck");
    expect(findForm('relinquish', 'They relinquishd it.')).toBe('relinquishd');
    // but not unrelated words, and short words must be exact
    expect(findForm('screw', 'Hand me the screwdriver.')).toBeNull();
    expect(findForm('bail', 'Use this bait.')).toBeNull();
    expect(findForm('meticulous', 'She was very careful.')).toBeNull();
  });
  it('blanks every occurrence', () => {
    expect(blankOut('No way. No way!', 'No way')).toBe(`${BLANK}. ${BLANK}!`);
  });
});

describe('importer', () => {
  it('parses TSV pasted from Sheets and quoted CSV', () => {
    expect(parseTable('word\tmeaning\nbail\tドタキャンする\n')).toEqual([
      ['word', 'meaning'],
      ['bail', 'ドタキャンする'],
    ]);
    expect(parseTable('w,ex\n"no way","He said, ""No way!""\nthen left"')).toEqual([
      ['w', 'ex'],
      ['no way', 'He said, "No way!"\nthen left'],
    ]);
  });
  it('guesses columns from Japanese or English headers', () => {
    expect(guessColumns(['単語', '意味', '例文', 'アニメ'])).toEqual(['w', 'm', 'ex', 'src']);
    expect(guessColumns(['Phrase', 'Meaning', 'Episode', 'Memo'])).toEqual(['w', 'm', 'src', 'note']);
    expect(guessColumns(['foo', 'bar'])).toEqual(['w', '']);
    expect(looksLikeHeader(['English', '日本語'])).toBe(true);
    expect(looksLikeHeader(['bail', 'ドタキャン'])).toBe(false);
  });
  it('dedupes words and skips blank rows', () => {
    const words = rowsToWords('l', [['w'], ['Bail'], ['bail.'], [''], ['dork']], ['w'], true);
    expect(words.map((w) => w.id)).toEqual(['bail', 'dork']);
  });
  it('splits English + Japanese typed into one cell', () => {
    expect(splitCombined('get a grip - 落ち着け')).toEqual(['get a grip', '落ち着け']);
    expect(splitCombined('bail：ドタキャンする')).toEqual(['bail', 'ドタキャンする']);
    expect(splitCombined("I've got your back（任せろ）")).toEqual(["I've got your back", '（任せろ）']);
    expect(splitCombined('you got this！ がんばって')).toEqual(['you got this', 'がんばって']);
    expect(splitCombined('just english')).toBeNull();
    const words = rowsToWords('l', [['“No way!” 無理'], ['beat it']], ['w'], false);
    expect(words.map((w) => [w.w, w.m])).toEqual([
      ['no way!', '無理'],
      ['beat it', undefined],
    ]);
  });
  it('guesses columns from content when there are no titles', () => {
    const empty = (n: number) => Array.from({ length: n }, () => '' as const);
    // word+meaning in one cell, then the anime line
    expect(
      guessByContent(
        [
          ['dont push your luck - 調子に乗るな', "Don't push your luck, kid."],
          ['recklesly：無謀に', 'He charged recklessly into the dungeon.'],
          ['nonchalent 平然とした', ''],
        ],
        empty(2)
      )
    ).toEqual(['w', 'ex']);
    // meaning first, then word, then line, then line translation, then episode
    expect(
      guessByContent(
        [
          ['落ち着け', 'get a grip', 'Get a grip, we can still win this!', 'しっかりしろ、まだ勝てる！', 'ep 3'],
          ['逃げる', 'bail', "You can't bail on us now, man.", '今さら逃げるなよ', 'ep 4'],
        ],
        empty(5)
      )
    ).toEqual(['m', 'w', 'ex', 'exJa', '']);
    // recognized titles are kept; unrecognized ones filled from content
    expect(guessByContent([['bail', 'to leave suddenly and let people down', '逃げる']], ['w', '', ''])).toEqual(['w', 'ex', 'm']);
  });
  it('tidies words as typed in her sheet', () => {
    expect(cleanWord('Exterminate ')).toBe('exterminate');
    expect(cleanWord('finish~off')).toBe('finish off');
    expect(cleanWord('Madam~')).toBe('madam');
    expect(cleanWord("I'm impervious")).toBe("I'm impervious");
    expect(cleanWord('Keep your chin up')).toBe('keep your chin up');
    expect(cleanWord('“No way!”')).toBe('no way!');
    expect(cleanWord('NASA')).toBe('NASA');
    expect(guessColumns(['ジャンル', '日', '単語', '意味', 'メモ', ''])).toEqual(['src', '', 'w', 'm', 'note', '']);
  });
  it('re-applies spelling fixes made in the app', () => {
    const words = rowsToWords('l', [['recklesly', 'x']], ['w', 'm'], false, { recklesly: 'recklessly' });
    expect(words[0]).toMatchObject({ id: 'recklesly', w: 'recklessly', orig: 'recklesly' });
  });
  it('turns sheet links into CSV URLs', () => {
    const u = sheetCsvUrls('https://docs.google.com/spreadsheets/d/ABC_123/edit?usp=sharing#gid=42');
    expect(u[0]).toBe('https://docs.google.com/spreadsheets/d/ABC_123/export?format=csv&gid=42');
    expect(sheetCsvUrls('https://docs.google.com/spreadsheets/d/e/2PACX-x/pubhtml')[0]).toBe(
      'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?output=csv'
    );
    expect(sheetCsvUrls('https://example.com')).toEqual([]);
  });
});

describe('commonTypoFixes', () => {
  it('covers the typos learners make most', () => {
    const fixes = commonTypoFixes('grining');
    expect(fixes).toContain('grinning'); // missed double letter
    expect(commonTypoFixes('assasin')).toContain('assassin');
    expect(commonTypoFixes('recieve')).toContain('receive'); // swapped neighbours
    expect(commonTypoFixes('boundle')).toContain('bundle'); // extra letter
    expect(commonTypoFixes('struckt')).toContain('struck');
  });
});

describe('simplifyPhrase', () => {
  it('reduces noted phrases to something a dictionary has', () => {
    expect(simplifyPhrase('Urge to')).toBe('urge');
    expect(simplifyPhrase('obtained by ~ing')).toBe('obtained');
    expect(simplifyPhrase('my graditute')).toBe('graditute');
    expect(simplifyPhrase('nither A or B')).toBe('nither');
    expect(simplifyPhrase("It's bummer")).toBe('bummer');
    expect(simplifyPhrase('Charged with')).toBe('charged');
    expect(simplifyPhrase('keep your chin up')).toBeNull();
    expect(simplifyPhrase('hamper')).toBeNull();
  });
});

describe('items', () => {
  it('derives quiz directions from available fields', () => {
    expect(makeItem('l', 'mine', { id: 'a', w: 'bail' }).dirs).toEqual([]);
    expect(makeItem('l', 'mine', { id: 'a', w: 'bail', m: 'ドタキャン' }).dirs).toEqual([0, 1]);
    const full = makeItem('l', 'mine', { id: 'a', w: 'bail', m: 'x', en: 'leave', ex: 'Don’t bail on me.' });
    expect(full.dirs).toEqual([0, 1, 2, 3]);
    expect(full.form).toBe('bail');
    // example that doesn't contain the word → no cloze
    expect(makeItem('l', 'mine', { id: 'a', w: 'bail', ex: 'He left.' }).dirs).toEqual([]);
  });
  it('splits meanings into senses', () => {
    expect([...meaningKeys('（敵を）打ち負かす、征服する')]).toEqual(['打ち負かす', '~打ち', '征服する', '~征服す']);
  });
});

function mkRun(maxPer: number): RunRow {
  return { listId: 'l', startedAt: 0, maxPer, total: 0, points: 0, doneGroups: 0 };
}

describe('QuizSession', () => {
  const items = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map((w, i) =>
    makeItem('l', 'eiken', { id: w, w, m: `意味${i}`, en: `def ${i}`, ex: `Say ${w} now.` })
  );
  const rows = () =>
    new Map<string, ProgressRow>(items.map((it, idx) => [it.id, { listId: 'l', itemId: it.id, idx, c: [0, 0, 0, 0], done: 0 }]));

  it('builds four distinct options with the answer included', () => {
    const s = new QuizSession(items, rows(), mkRun(1), 3);
    for (let i = 0; i < 30; i++) {
      const q = s.next()!;
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.label)).size).toBe(4);
      expect(q.options[q.correct].item.id).toBe(q.item.id);
    }
  });

  it('never offers a synonym as a wrong answer', () => {
    const syn = [
      makeItem('l', 'anime', { id: 'beat-it', w: 'beat it', m: '失せろ、あっち行け' }),
      makeItem('l', 'anime', { id: 'get-lost', w: 'get lost', m: '消えろ、失せろ' }),
      makeItem('l', 'anime', { id: 'shady', w: 'shady', m: '怪しい', en: 'seeming dishonest or possibly illegal' }),
      ...items,
    ];
    const r = new Map<string, ProgressRow>(syn.map((it, idx) => [it.id, { listId: 'l', itemId: it.id, idx, c: [0, 0, 0, 0], done: 0 }]));
    const s = new QuizSession(syn.slice(0, 1), r, mkRun(5), 1, Math.random, syn);
    for (let i = 0; i < 40; i++) {
      const q = s.next()!;
      expect(q.options.map((o) => o.item.id)).not.toContain('get-lost');
    }
    const sketchy = makeItem('l', 'anime', { id: 'sketchy', w: 'sketchy', m: '怪しげな', en: 'seeming unsafe, unreliable, or dishonest' });
    const r2 = new Map(r);
    r2.set('sketchy', { listId: 'l', itemId: 'sketchy', idx: 99, c: [0, 0, 0, 0], done: 0 });
    const s2 = new QuizSession([sketchy], r2, mkRun(5), 1, Math.random, [sketchy, ...syn]);
    for (let i = 0; i < 40; i++) {
      expect(s2.next()!.options.map((o) => o.item.id)).not.toContain('shady');
    }
  });

  it('retires a word once every direction is maxed and finishes the list', () => {
    const s = new QuizSession(items, rows(), mkRun(1), 2);
    let guard = 0;
    while (!s.listDone() && guard++ < 500) {
      const q = s.next()!;
      s.answer(q, q.correct);
    }
    expect(s.listDone()).toBe(true);
    expect(s.run.doneGroups).toBe(items.length);
    expect(s.run.points).toBe(items.length * 4);
  });

  it('wrong answers score nothing', () => {
    const s = new QuizSession(items, rows(), mkRun(1), 2);
    const q = s.next()!;
    s.answer(q, (q.correct + 1) % 4);
    expect(s.run.points).toBe(0);
  });
});
