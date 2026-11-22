// SPDX-License-Identifier: Apache-2.0
// Spec 020, J1: the small things a writer feels every day.
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import '../../i18n';
import { documentExtensions } from './extensions';
import { findMatches } from './find';
import { linkedPages } from './gone-links';
import { looksLikeMarkdown } from './paste';
import { wordsIn } from './word-count';

const schema = getSchema(documentExtensions());
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('whole word in find', () => {
  const doc = schema.nodeFromJSON({ type: 'doc', content: [paragraph('cat concat cats cat_x cat. Cat')] });
  const whole = { matchCase: false, wholeWord: true };

  it('skips matches inside a longer word', () => {
    expect(findMatches(doc, 'cat', { matchCase: false, wholeWord: false })).toHaveLength(6);
    expect(findMatches(doc, 'cat', whole)).toHaveLength(3);
  });

  it('works together with match case', () => {
    expect(findMatches(doc, 'Cat', { matchCase: true, wholeWord: true })).toHaveLength(1);
  });

  it('treats letters with accents as part of a word', () => {
    const accents = schema.nodeFromJSON({ type: 'doc', content: [paragraph('écat caté cat')] });
    expect(findMatches(accents, 'cat', whole)).toHaveLength(1);
  });
});

describe('recognising pasted Markdown', () => {
  it.each([
    ['a heading', '# Plan'],
    ['a code fence', 'look:\n```\nx\n```'],
    ['a link', 'see [the plan](https://example.com)'],
    ['bold', 'this is **important**'],
    ['a table', '| a | b |\n|---|---|\n| 1 | 2 |'],
    ['two list lines', '- one\n- two'],
    ['a numbered list', '1. one\n2. two'],
  ])('sees %s', (_name, text) => {
    expect(looksLikeMarkdown(text)).toBe(true);
  });

  it.each([
    ['plain words', 'Just a sentence.'],
    ['several lines', 'one\ntwo\nthree'],
    ['one dash', '- only this'],
    ['a hash tag', '#general is the channel'],
    ['an address', 'https://example.com/a_b'],
    ['a sum', '2 * 3 * 4'],
  ])('leaves %s alone', (_name, text) => {
    expect(looksLikeMarkdown(text)).toBe(false);
  });
});

describe('the pages a document links to', () => {
  const id = '019a0000-0000-7000-8000-00000000000a';
  const linked = (href: string) => ({
    type: 'text',
    text: 'x',
    marks: [{ type: 'link', attrs: { href } }],
  });

  it('finds them in nested blocks, once each, with or without a tail', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [linked(`/pages/${id}`), linked(`/pages/${id}#part`)] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [linked(`/pages/${id}/edit`)] }] },
          ],
        },
      ],
    };
    expect(linkedPages(doc)).toEqual([id]);
  });

  it('ignores addresses outside this instance', () => {
    const doc = { type: 'doc', content: [linked(`https://example.com/pages/${id}`), linked('/spaces/x')] };
    expect(linkedPages(doc)).toEqual([]);
  });
});

describe('counting words', () => {
  it('counts nothing in empty text', () => {
    expect(wordsIn('')).toBe(0);
    expect(wordsIn('   ')).toBe(0);
  });

  it('counts across lines and double spaces', () => {
    expect(wordsIn(' one  two\nthree ')).toBe(3);
  });
});
