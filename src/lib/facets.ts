import type { StudyItem } from './types';
import { blankOut } from './cloze';

/** w = the English word, m = its meaning, d = English definition, x = fill-in-the-blank sentence. */
export type Facet = 'w' | 'm' | 'd' | 'x';

/**
 * The four quiz directions as [prompt, answer] facet pairs.
 * Progress counts (ProgressRow.c) are indexed by position in this array.
 */
export const DIRS: readonly (readonly [Facet, Facet])[] = [
  ['w', 'm'],
  ['m', 'w'],
  ['d', 'w'],
  ['x', 'w'],
] as const;

/** Column labels for the list overview, in DIRS order. */
export const DIR_LABELS = ['語→意', '意→語', '定義', '例文'];

/** Directions an item can be quizzed in, given which fields it has. */
export function computeDirs(it: Pick<StudyItem, 'm' | 'en' | 'form'>): number[] {
  const dirs: number[] = [];
  if (it.m) dirs.push(0, 1);
  if (it.en) dirs.push(2);
  if (it.form) dirs.push(3);
  return dirs;
}

export function promptTextFor(item: StudyItem, facet: Facet): string {
  switch (facet) {
    case 'w':
      return item.w;
    case 'm':
      return item.m ?? '';
    case 'd':
      return item.en ?? '';
    case 'x':
      return blankOut(item.clozeSentence ?? '', item.form ?? '');
  }
}

export function optionLabelFor(item: StudyItem, facet: Facet): string {
  switch (facet) {
    case 'm':
      return item.mShort;
    default:
      return item.w;
  }
}

/** Small instruction shown above the prompt. */
export function promptHint(facet: Facet): string {
  switch (facet) {
    case 'w':
      return '意味は？';
    case 'm':
      return '英語では？';
    case 'd':
      return '英英定義に合う語は？';
    case 'x':
      return '空所に入る語は？';
  }
}
