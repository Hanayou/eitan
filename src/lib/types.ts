export type Group = 'eiken' | 'anime' | 'mine';

export interface ListMeta {
  id: string;
  group: Group;
  title: string;
  /** Short subtitle shown under the title on the lists page. */
  sub?: string;
  count: number;
}

export interface ListsIndex {
  version: number;
  built: string;
  lists: ListMeta[];
}

/** Raw item as shipped in public/data/list/*.json (built-in lists). */
export interface RawItem {
  id: string;
  /** Headword / phrase. */
  w: string;
  pos?: string;
  /** Meaning — Japanese for built-ins, whatever she wrote for her own words. */
  m?: string;
  /** English definition. */
  en?: string;
  /** Example sentence. */
  ex?: string;
  /** Exact form of the word as it appears in ex. */
  f?: string;
  /** Japanese translation of ex. */
  exJa?: string;
  note?: string;
}

/**
 * One of her own words, stored in IndexedDB (db.words). Columns from the
 * sheet plus anything filled in by the online dictionary lookup.
 */
export interface WordRow {
  listId: string;
  id: string;
  /** Position in the sheet, for working-set ordering. */
  idx: number;
  w: string;
  m?: string;
  ex?: string;
  exJa?: string;
  /** Where she heard it, e.g. "Frieren ep 4". */
  src?: string;
  note?: string;
  /** From dictionary lookup. */
  en?: string;
  pos?: string;
  /** Example sentence from the dictionary, used when she didn't record one. */
  dex?: string;
  /** Lookup was attempted (so we don't retry words the dictionary lacks). */
  looked?: 1;
  /** Dictionary's "did you mean" for a word it couldn't find. */
  sug?: string;
  /** Spelling as it is in the sheet, when she corrected it in the app. */
  orig?: string;
}

/** Normalized item used throughout the app. */
export interface StudyItem {
  id: string;
  listId: string;
  group: Group;
  w: string;
  pos?: string;
  m?: string;
  en?: string;
  ex?: string;
  exJa?: string;
  /** Dictionary example (her own words only). */
  dex?: string;
  note?: string;
  src?: string;
  /** Example + translation borrowed from the built-in entry for the same word (her own words). */
  bex?: string;
  bexJa?: string;
  /** Did-you-mean spelling from the dictionary (her own words). */
  sug?: string;
  /** Sheet spelling, when corrected in the app. */
  orig?: string;
  /** Form of w found in the cloze sentence, or undefined if no cloze is possible. */
  form?: string;
  /** Sentence used for the fill-in-the-blank question. */
  clozeSentence?: string;
  /** Quiz directions available for this item (indices into DIRS). */
  dirs: number[];
  /** Compact meaning label for answer buttons. */
  mShort: string;
  /** Individual meaning senses (split on 、／ etc.) — words sharing one are never each other's wrong answer. */
  mKeys: Set<string>;
  /** Content words of the English definition — two shared ones mark a near-synonym. */
  enKeys: Set<string>;
  /** Normalized headword for collision checks and search. */
  key: string;
  /** Lowercase blob of meaning + definition for search. */
  searchText: string;
}
