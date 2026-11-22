// SPDX-License-Identifier: Apache-2.0
// A small drawing of a block, under its description in the insert dialog's tooltip (spec 082,
// D22). A preview is a small document, shown by the same code as a page, so it can never look
// different from the real thing.
import type { Json } from '../../api';
import { DocumentView } from './editor';
import { FIRST_PANEL_EMOJI } from './palette';

const line = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (level: number) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text: 'A heading' }],
});
const list = (type: string, item: string) => ({
  type,
  content: ['First', 'Second'].map((text) => ({ type: item, content: [line(text)] })),
});
const panel = (kind: string) => ({ type: 'panel', attrs: { kind }, content: [line('Something to notice')] });
const COLUMN_WORDS = ['One', 'Two', 'Three', 'Four', 'Five'];
const columns = (count: number, layout: string | null = null) => ({
  type: 'columns',
  attrs: layout ? { layout } : {},
  content: COLUMN_WORDS.slice(0, count).map((text) => ({ type: 'column', content: [line(text)] })),
});

// Blocks that show data of a page or a space have no sample: their description says what they do.
const SAMPLES: Record<string, unknown> = {
  text: line('Ordinary text'),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((level) => [`h${level}`, heading(level)])),
  bullet: list('bulletList', 'listItem'),
  ordered: list('orderedList', 'listItem'),
  task: {
    type: 'taskList',
    content: ['Open', 'Done'].map((text, i) => ({
      type: 'taskItem',
      attrs: { checked: i === 1 },
      content: [line(text)],
    })),
  },
  quote: { type: 'blockquote', content: [line('Words of someone else')] },
  code: { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const a = 1;' }] },
  rule: { type: 'horizontalRule' },
  panelInfo: panel('info'),
  panelNote: panel('note'),
  panelSuccess: panel('success'),
  panelWarning: panel('warning'),
  panelError: panel('error'),
  panelNeutral: {
    type: 'panel',
    attrs: { kind: 'neutral', emoji: FIRST_PANEL_EMOJI },
    content: [line('Your own emoji')],
  },
  spotlight: {
    type: 'spotlight',
    attrs: { color: 'blue' },
    content: [heading(2), line('An important message')],
  },
  expand: {
    type: 'expand',
    attrs: { title: 'Open to read more', open: true },
    content: [line('Hidden text')],
  },
  columns2: columns(2),
  columns3: columns(3),
  columns4: columns(4),
  columns5: columns(5),
  columnsSidebar: columns(2, 'sidebar-end'),
  decision: { type: 'decision', content: [{ type: 'text', text: 'We go with the second option' }] },
  table: {
    type: 'table',
    content: [0, 1].map((row) => ({
      type: 'tableRow',
      content: [0, 1].map((column) => ({
        type: 'tableCell',
        content: [line(`Cell ${row * 2 + column + 1}`)],
      })),
    })),
  },
  status: {
    type: 'paragraph',
    content: [{ type: 'status', attrs: { text: 'In progress', color: 'blue' } }],
  },
  date: { type: 'paragraph', content: [{ type: 'date', attrs: { value: '2026-11-07' } }] },
};

/** Whether an entry has a drawing to show. */
export const hasSample = (id: string): boolean => SAMPLES[id] !== undefined;

/** The drawing of one entry, hidden from screen readers, which hear its description. */
export function InsertPreview({ id }: { id: string }) {
  const sample = SAMPLES[id];
  if (sample === undefined) return null;
  return (
    <div className="insert-preview" aria-hidden="true" inert>
      <DocumentView key={id} plain document={{ type: 'doc', content: [sample] } as Json} />
    </div>
  );
}
