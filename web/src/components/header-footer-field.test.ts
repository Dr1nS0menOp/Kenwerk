// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import '../i18n';
import { noteExtensions } from './header-footer-field';

const schema = getSchema(noteExtensions());

// The field offers exactly what the server stores (spec 089, D2): what its schema does not hold,
// a writer cannot build, and pasted content is cut down to it.
describe('the field of the header and footer', () => {
  it('holds paragraphs, words, line breaks and status marks, and no other node', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(['doc', 'hardBreak', 'paragraph', 'status', 'text']);
    for (const type of ['heading', 'bulletList', 'image', 'table', 'codeBlock', 'blockquote', 'mention']) {
      expect(() => schema.nodeFromJSON({ type: 'doc', content: [{ type }] }), type).toThrow();
    }
  });

  it('holds bold, italic, underline, a text colour and links, and no other mark', () => {
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'italic', 'link', 'textColor', 'underline']);
  });

  it('keeps the alignment and direction of a line, and no other attribute', () => {
    const line = schema.nodeFromJSON({
      type: 'paragraph',
      attrs: { align: 'center', dir: 'rtl', indent: 2, style: 'x' },
    });
    expect(line.attrs).toEqual({ align: 'center', dir: 'rtl' });
  });

  it('shows no link the band does not allow', () => {
    const link = schema.marks.link;
    for (const href of [
      'javascript:alert(1)',
      'http://intranet.example/',
      'https://intranet.example@other.example/',
    ]) {
      const shown = link?.spec.toDOM?.(link.create({ href }), true);
      expect(JSON.stringify(shown), href).not.toContain(href);
    }
  });
});
