// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../i18n';
import { NoteContent, noteLink, type NoteNode } from './instance-note';

const line = (...content: NoteNode[]): NoteNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});
const linked = (href: string): NoteNode =>
  line({ type: 'text', text: 'Contact', marks: [{ type: 'link', attrs: { href } }] });
const shown = (doc: NoteNode) => renderToStaticMarkup(<NoteContent doc={doc} />);

// The band is the installation's words on every page (spec 089), so its renderer holds the same
// line as the server: what it does not know becomes words or nothing, never markup or a link.
describe('the header and footer on a page', () => {
  it('shows no link the band does not allow, only its words', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://intranet.example/',
      'https://intranet.example@other.example/',
      'https://user:pass@other.example/',
      'https://\u0435xample.org/',
      '//other.example/',
      '/\\other.example/',
      '#top',
      'mailto:a@example.org?bcc=b@example.org',
      'https://help.example.org/a b',
    ]) {
      const html = shown(linked(href));
      expect(html, href).not.toContain('<a');
      expect(html, href).toContain('Contact');
    }
  });

  it('keeps markup in the words as words', () => {
    const html = shown(line({ type: 'text', text: '<img src=x onerror=alert(1)><script>alert(1)</script>' }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows nothing of a node it does not know, and plain words for a mark it does not know', () => {
    const html = shown({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Headline' }] },
        { type: 'image', attrs: { src: 'https://other.example/x.png' } },
        { type: 'script', text: 'alert(1)' },
        {
          type: 'paragraph',
          attrs: { onclick: 'alert(1)', style: 'color:red' },
          content: [
            { type: 'text', text: 'marked', marks: [{ type: 'highlight', attrs: { color: 'yellow' } }] },
            { type: 'status', attrs: { color: 'neon', text: 'Odd' } },
            { type: 'mention', attrs: { label: 'Ann' } },
          ],
        },
      ],
    });
    expect(html).toBe('<p><span>marked</span></p>');
  });

  it('shows where an outside link goes after its words, and opens it apart from this page', () => {
    const html = shown(linked('https://Help.Example.org/wiki'));
    expect(html).toContain('href="https://Help.Example.org/wiki"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toMatch(/Contact<span class="note-host"> \(help\.example\.org\)<\/span>/);
  });

  it('opens a link inside this installation and a mail address as ordinary links', () => {
    for (const href of ['/spaces/HR/pages/0193f6d2', 'mailto:help@example.org']) {
      const html = shown(linked(href));
      expect(html, href).toContain(`href="${href}"`);
      expect(html, href).not.toContain('target=');
      expect(html, href).not.toContain('note-host');
    }
  });

  it('keeps the alignment, the colours and the status marks of the subset', () => {
    const html = shown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { align: 'center' },
          content: [
            { type: 'status', attrs: { color: 'blue', text: 'Internal' } },
            { type: 'hardBreak' },
            {
              type: 'text',
              text: 'quiet',
              marks: [{ type: 'bold' }, { type: 'textColor', attrs: { color: 'teal' } }],
            },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<p data-align="center"><span class="status-mark mark-blue">Internal</span><br/><span><strong><span class="text-teal">quiet</span></strong></span></p>',
    );
  });
});

describe('the link rule of the band', () => {
  it('sorts addresses as the server does', () => {
    expect(noteLink('https://help.example.org:8443/wiki')).toEqual({
      kind: 'outside',
      href: 'https://help.example.org:8443/wiki',
      host: 'help.example.org',
    });
    expect(noteLink('https://xn--bcher-kva.example/').kind).toBe('outside');
    expect(noteLink('mailto:help@example.org').kind).toBe('mail');
    expect(noteLink('/').kind).toBe('inside');
    for (const href of [
      'https://',
      'https://a..',
      'https://help.example.org:x/',
      'mailto:',
      'ftp://x.example/',
    ]) {
      expect(noteLink(href).kind, href).toBe('refused');
    }
  });
});
