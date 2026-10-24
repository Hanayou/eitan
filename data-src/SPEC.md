# Word-list authoring spec (英単 Eitan)

Learner: a Japanese adult studying for 英検1級 (Eiken Grade 1), who also learns
English from anime watched with English audio/subtitles. Entries are shown in a
multiple-choice quiz app: word → Japanese meaning, Japanese meaning → word,
English definition → word, and a fill-in-the-blank example sentence → word.

## Output

A single JSON file: an array of entry objects, nothing else (UTF-8, no comments).

```json
{
  "w": "relinquish",
  "pos": "v",
  "ja": "（権利・地位などを）放棄する、手放す",
  "en": "to give up a right, position, or possession, often unwillingly",
  "ex": "After two decades in power, the general finally agreed to relinquish control of the army.",
  "f": "relinquish",
  "exJa": "20年間権力を握った後、将軍はついに軍の統制権を手放すことに同意した。"
}
```

Fields:
- `w` — headword in dictionary form (lowercase unless a proper noun). Phrases allowed (`"get the hang of"`).
- `pos` — one of `v`, `adj`, `n`, `adv`, `phr` (phrasal verb / idiom / spoken phrase).
- `ja` — concise natural Japanese meaning, the way a good 英検 単語帳 would gloss it. Use （） for context/objects. Max ~25 characters; put the most important sense first, separate senses with 、.
- `en` — short English learner's-dictionary definition, max ~90 characters. It must NOT contain the headword or an obvious form of it.
- `ex` — ONE original example sentence, 10–25 words, natural and idiomatic. It must contain the headword (possibly inflected) so it can be blanked out, and the sentence context must make the answer reasonably guessable for an advanced learner.
- `f` — the exact substring of `ex` that is the headword as used (e.g. `"relinquished"`, `"got the hang of"`). Case-sensitive exact match; it must occur in `ex` exactly once.
- `exJa` — natural Japanese translation of `ex`.
- `note` — optional, only for register/usage worth flagging, in Japanese, max ~20 chars (e.g. `"くだけた表現"`, `"失礼な言い方"`, `"主に英"`).

## Rules

- Write every example sentence yourself. Never copy sentences from published
  books, dictionaries, past exam papers, or any real anime/film dialogue.
- No duplicate headwords within your file.
- Accuracy matters more than count: if unsure of a word's meaning or usage, leave it out.
- Before finishing, write and run a short Node script (keep it in your scratchpad/temp dir, not
  in the data folder) that parses your file and checks: valid JSON array; every
  required field present and non-empty; `pos` valid; `f` occurs in `ex` exactly once;
  `en` doesn't contain `w`; no duplicate `w`. Fix every failure and re-run until clean.
- Report back only: the file path, entry count, and anything you were unsure about.
