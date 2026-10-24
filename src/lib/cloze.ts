/**
 * Finding a word inside a sentence so it can be blanked out — without AI.
 * Handles regular inflections (relinquish → relinquished, rely → relied,
 * stop → stopping), straight/curly apostrophes, and phrase placeholders like
 * "one's" / "someone" (get on one's nerves → get on my nerves).
 */

const APOS = "['’]";
const PRONOUNS = "(?:my|your|his|her|its|our|their|one's|one’s|someone's|someone’s)";
const OBJ = "(?:[\\w'’-]+(?:\\s+[\\w'’-]+)?)";

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, APOS);
}

const VOWEL = /[aeiou]/;

/** Regex source matching one word in any regular inflected form. */
function inflected(word: string): string {
  const w = word.toLowerCase();
  const forms = new Set<string>([esc(w) + '(?:s|es|ed|d|ing|er|est|ly|ment)?']);
  if (w.endsWith('e')) forms.add(esc(w.slice(0, -1)) + '(?:ing|ed|er|est|ion|ation)');
  if (w.endsWith('y') && w.length > 2 && !VOWEL.test(w[w.length - 2])) {
    forms.add(esc(w.slice(0, -1)) + '(?:ies|ied|ier|iest|ily|iness)');
  }
  if (w.endsWith('ie')) forms.add(esc(w.slice(0, -2)) + 'ying');
  // CVC doubling: stop → stopped, abet → abetted, refer → referred
  const last = w[w.length - 1];
  if (w.length >= 3 && /[bdfglmnprtvz]/.test(last) && VOWEL.test(w[w.length - 2]) && !VOWEL.test(w[w.length - 3])) {
    forms.add(esc(w) + esc(last) + '(?:ed|ing|er|est)');
  }
  if (w.endsWith('c')) forms.add(esc(w) + 'k(?:ed|ing|s)');
  return `(?:${[...forms].join('|')})`;
}

function phrasePattern(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  return words
    .map((p, i) => {
      const lw = p.toLowerCase();
      if (lw === "one's" || lw === 'one’s' || lw === "someone's" || lw === 'someone’s') return PRONOUNS;
      if (lw === 'sb' || lw === 'sth' || lw === 'someone' || lw === 'something' || lw === 'sb/sth') return OBJ;
      if (lw === 'oneself') return '(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves|oneself)';
      // first word of a phrase (usually the verb) may inflect; the rest is fixed
      return i === 0 && /^[a-z]+$/i.test(p) ? inflected(p) : esc(p);
    })
    .join('\\s+');
}

/** Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos to forgive for a word/phrase of this many letters. */
function typoBudget(len: number): number {
  return len <= 4 ? 0 : len <= 7 ? 1 : len <= 12 ? 2 : 3;
}

const letters = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z']/g, '');

/**
 * Typo-tolerant fallback: slide a window of roughly the phrase's word count
 * over the sentence and take the closest run of words, if it's within budget.
 * Catches "recklesly" ↔ "recklessly", "your gonna regret" ↔ "you're gonna regret".
 */
function fuzzyFind(word: string, sentence: string): string | null {
  const target = letters(word);
  const budget = typoBudget(target.replace(/'/g, '').length);
  if (!budget) return null;
  const n = word.trim().split(/\s+/).length;
  const toks = [...sentence.matchAll(/[A-Za-z][A-Za-z'’-]*/g)];
  let best: { d: number; s: string } | null = null;
  for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
    for (let i = 0; i + size <= toks.length; i++) {
      const first = toks[i];
      const last = toks[i + size - 1];
      const span = sentence.slice(first.index!, last.index! + last[0].length);
      if (letters(span)[0] !== target[0]) continue; // typos rarely hit the first letter
      if (Math.abs(letters(span).length - target.length) > budget + 3) continue;
      // allow for inflection on top of the typo (+3 letters of suffix)
      const got = letters(span);
      const d = editDistance(target, got);
      const dSuffix = got.length <= target.length + 3 && got.startsWith(target.slice(0, -1)) ? 0 : d;
      const score = Math.min(d, dSuffix);
      if (score <= budget && (!best || score < best.d)) best = { d: score, s: span };
    }
  }
  return best?.s ?? null;
}

/**
 * Locate `word` in `sentence`. Returns the exact matched substring (original
 * casing), or null if it can't be found. Matches whole words only, falling
 * back to a typo-tolerant match for words she spelled slightly differently.
 */
export function findForm(word: string, sentence: string, fuzzy = true): string | null {
  const w = word.trim();
  if (!w || !sentence) return null;
  const core = /\s/.test(w) ? phrasePattern(w) : /^[a-z]+$/i.test(w) ? inflected(w) : esc(w);
  const re = new RegExp(`(?<![\\w'’])${core}(?![\\w])`, 'i');
  const m = re.exec(sentence);
  return m ? m[0] : fuzzy ? fuzzyFind(w, sentence) : null;
}

export const BLANK = '＿＿＿＿';

/** Sentence with every occurrence of `form` replaced by a blank. */
export function blankOut(sentence: string, form: string): string {
  const re = new RegExp(`(?<![\\w'’])${esc(form)}(?![\\w])`, 'gi');
  return sentence.replace(re, BLANK);
}

/** Split a sentence into [before, form, after] for highlighting the answer. */
export function splitAround(sentence: string, form: string): [string, string, string] | null {
  const i = sentence.indexOf(form);
  if (i < 0) return null;
  return [sentence.slice(0, i), form, sentence.slice(i + form.length)];
}
