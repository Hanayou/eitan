# 英単 Eitan

An offline English vocabulary drill PWA for a Japanese learner aiming at 英検1級
who also picks up English from anime. Sister app to 勉強 Benkyō — same drill loop,
same look. No accounts, no server: progress lives on the device.

## What it does

- **Built-in lists** (~2,835 words, each with a Japanese meaning, English
  definition, original example sentence and translation):
  - 英検1級 (2,525): Verbs 1–4, Adjectives 1–3, Nouns 1–3, Adverbs, Phrasal
    verbs — split into sets of ≤250 so each one is finishable
  - Anime English (310): Everyday phrases & slang, Story & battle words
- **Her own words from Google Sheets**: paste the sheet's share link (sheet set
  to "Anyone with the link → Viewer"), or copy the cells and paste them. Columns
  are auto-detected — from titles like 単語 / 意味 / 例文 / アニメ (or English
  equivalents), or, with no title row, from the contents (Japanese → meaning,
  long English → example line, short English → word). Any guess can be changed.
  Linked sheets re-sync with one tap; progress for existing words is kept.
- **Forgiving about messy sheets**: "get a grip – 落ち着け" in one cell is split
  into word + meaning; quotes around phrases are dropped; a slightly misspelled
  word is still found in its example line ("recklesly" ↔ "recklessly").
- **Four question types**, as 4-choice questions:
  語→意 (word → meaning), 意→語 (meaning → word), 定義 (English definition →
  word), 例文 (fill-in-the-blank example sentence → word). Each item uses the
  ones its data supports — e.g. a word she logged with the anime line it came
  from becomes a fill-in-the-blank question using that line.
- **辞書で調べる**: for her own words, an optional online lookup (Wiktionary)
  adds an English definition and a dictionary example, unlocking the 定義 and
  例文 questions for words she only wrote down. Words the dictionary can't find
  get a typo suggestion (nonchalent → nonchalant) that she can accept with one
  tap, or she can edit any spelling by hand; corrections survive re-syncs.
- **Classic drill loop** from Benkyō: working set of ~20 words, each direction
  maxes out after N correct answers (default 3), maxed words retire.
- Wrong answers are drawn from the same part of speech, and near-synonyms
  (shared Japanese sense or English definition words) are never offered as
  wrong answers to each other.
- Text-to-speech button on every word and sentence (iOS built-in voices, offline).
- Search across every list, settings, clipboard backup/restore.

## Development

```bash
npm install
npm run data:build   # data-src/*.json → public/data/
npm run icons        # regenerate icons
npm run dev
npm test
npm run build        # production build (dist/)
```

Word lists live in `data-src/` as hand-editable JSON (format in
`data-src/SPEC.md`). Edit a file, then `npm run data:build`.

## Deploying

Same as Benkyō: pushes to `main` deploy to GitHub Pages via
`.github/workflows/deploy.yml`. Any static host works — set `BASE_PATH` to the
URL prefix the app is served under.

## Installing on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. Everything
works offline except syncing a sheet and dictionary lookups.

## Credits

Built-in word lists and example sentences were written for this app (not
taken from published word books or exam papers) and are an unofficial
selection, not endorsed by 日本英語検定協会. Dictionary lookups use
[Wiktionary](https://en.wiktionary.org/) (CC BY-SA). Icon glyph from
[KanjiVG](https://kanjivg.tagaini.net/) (CC BY-SA 3.0).
