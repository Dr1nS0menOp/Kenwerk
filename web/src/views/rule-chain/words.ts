// SPDX-License-Identifier: Apache-2.0
// Turns the sentences of sentences.ts into words: values that are words themselves, such as "the
// owner" or "a page you cannot see", are translated before they go into their sentence.
import { useTranslation } from 'react-i18next';
import type { Problem } from '../rule-definition';
import { problemKey, type Sentence, type Tone } from './sentences';

export function useSentence(sentence: Sentence): { text: string; tone: Tone } {
  const { t } = useTranslation();
  const values = Object.fromEntries(
    Object.entries(sentence.values).map(([name, value]) => [
      name,
      typeof value === 'object' ? t(value.key) : value,
    ]),
  );
  return { text: t(sentence.key, values), tone: sentence.tone };
}

/** The words of a problem: its code translated, or the server's own words for a code not known here. */
export function useProblemWords() {
  const { t } = useTranslation();
  return (p: Problem) => (p.code ? t(problemKey(p.code), { defaultValue: p.message }) : p.message);
}
