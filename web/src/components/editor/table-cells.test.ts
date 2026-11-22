// SPDX-License-Identifier: Apache-2.0
// Spec 082, steps 8 and 9: what the cell menu does to the cells it acts on.
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import type { Node as ProseNode } from '@tiptap/pm/model';
import '../../i18n';
import { documentExtensions } from './extensions';
import { alignCellsStep, cellAlignment, cellHintAt, emptyCellsStep } from './table-cells';

const schema = getSchema(documentExtensions());
const text = (words: string, align?: string) => ({
  type: 'paragraph',
  ...(align ? { attrs: { align } } : {}),
  content: [{ type: 'text', text: words }],
});
const empty = { type: 'paragraph' };
const cell = (background: string | null, ...content: object[]) => ({
  type: 'tableCell',
  attrs: { background, colspan: 1, rowspan: 1 },
  content,
});
const table = (...rows: object[][]) => ({
  type: 'table',
  content: rows.map((cells) => ({ type: 'tableRow', content: cells })),
});
const docOf = (...content: object[]) => schema.nodeFromJSON({ type: 'doc', content });

/** Where the text of each cell starts, in document order. */
function cellStarts(doc: ProseNode): number[] {
  const starts: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') starts.push(pos);
    return true;
  });
  return starts;
}

const cursorIn = (doc: ProseNode, cellIndex: number) => {
  const at = cellStarts(doc)[cellIndex] ?? 0;
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, at + 2) });
};

const cellsFrom = (doc: ProseNode, first: number, last: number) => {
  const starts = cellStarts(doc);
  const selection = CellSelection.create(doc, starts[first] ?? 0, starts[last] ?? 0);
  return EditorState.create({ schema, doc, selection });
};

const applied = (state: EditorState, tr: Transaction | null) => {
  if (!tr) throw new Error('nothing changed');
  return state.apply(tr).doc;
};

const cellsOf = (doc: ProseNode) => {
  const cells: ProseNode[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'tableCell') cells.push(node);
    return true;
  });
  return cells;
};

describe('emptying a cell', () => {
  const twoByTwo = () =>
    docOf(
      table(
        [cell('yellow', text('one'), text('more')), cell(null, text('two'))],
        [cell('red', text('three')), cell(null, text('four'))],
      ),
    );

  it('clears the text of the cell with the cursor and keeps its colour', () => {
    const state = cursorIn(twoByTwo(), 0);
    const doc = applied(state, emptyCellsStep(state));
    const cells = cellsOf(doc);
    expect(cells).toHaveLength(4);
    expect(cells[0]?.textContent).toBe('');
    expect(cells[0]?.childCount).toBe(1);
    expect(cells[0]?.attrs.background).toBe('yellow');
    expect(cells[1]?.textContent).toBe('two');
  });

  it('clears every selected cell and keeps the shape of the table', () => {
    const state = cellsFrom(twoByTwo(), 0, 3);
    const doc = applied(state, emptyCellsStep(state));
    const cells = cellsOf(doc);
    expect(cells.map((one) => one.textContent)).toEqual(['', '', '', '']);
    expect(cells.map((one) => one.attrs.background as string | null)).toEqual(['yellow', null, 'red', null]);
    expect(doc.firstChild?.childCount).toBe(2);
  });

  it('does nothing outside a table', () => {
    const doc = docOf(text('words'));
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) });
    expect(emptyCellsStep(state)).toBeNull();
  });

  it('is one step, so one Undo restores it', () => {
    const state = cellsFrom(twoByTwo(), 0, 3);
    const tr = emptyCellsStep(state);
    expect(tr?.steps.length).toBeGreaterThan(0);
    expect(tr?.getMeta('addToHistory')).not.toBe(false);
  });
});

describe('the alignment of cells', () => {
  const row = () =>
    docOf(
      table([
        cell(null, text('a'), {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'h' }],
        }),
        cell(null, text('b')),
      ]),
    );

  it('sets every paragraph and heading in the cell, not only the one with the cursor', () => {
    const state = cursorIn(row(), 0);
    const doc = applied(state, alignCellsStep(state, 'center'));
    const first = cellsOf(doc)[0];
    const aligns: unknown[] = [];
    first?.forEach((child) => aligns.push(child.attrs.align));
    expect(aligns).toEqual(['center', 'center']);
    expect(cellsOf(doc)[1]?.firstChild?.attrs.align).toBeNull();
  });

  it('sets every selected cell', () => {
    const state = cellsFrom(row(), 0, 1);
    const doc = applied(state, alignCellsStep(state, 'end'));
    expect(cellsOf(doc).map((one) => one.firstChild?.attrs.align as unknown)).toEqual(['end', 'end']);
  });

  it('stores start as no alignment, and end as end, so a right-to-left page mirrors both', () => {
    const doc = docOf(table([cell(null, text('a', 'end'))]));
    const state = cursorIn(doc, 0);
    const back = applied(state, alignCellsStep(state, 'start'));
    expect(cellsOf(back)[0]?.firstChild?.attrs.align).toBeNull();
    const ended = applied(state, alignCellsStep(state, 'end'));
    expect(cellsOf(ended)[0]?.firstChild?.attrs.align).toBe('end');
  });

  it('reads the alignment the cells share, and none when they differ', () => {
    const same = docOf(table([cell(null, text('a', 'center')), cell(null, text('b', 'center'))]));
    expect(cellAlignment(cellsFrom(same, 0, 1))).toBe('center');
    expect(cellAlignment(cursorIn(docOf(table([cell(null, text('a'))])), 0))).toBe('start');
    const mixed = docOf(table([cell(null, text('a', 'center')), cell(null, text('b'))]));
    expect(cellAlignment(cellsFrom(mixed, 0, 1))).toBeNull();
  });
});

describe('the hint in an empty cell', () => {
  it('shows in the empty cell with the cursor', () => {
    const doc = docOf(table([cell(null, empty), cell(null, text('x'))]));
    expect(cellHintAt(cursorIn(doc, 0))).not.toBeNull();
  });

  it('goes at the first character', () => {
    const doc = docOf(table([cell(null, text('x'))]));
    expect(cellHintAt(cursorIn(doc, 0))).toBeNull();
  });

  it('never shows in an empty paragraph outside a table', () => {
    const doc = docOf(empty);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1) });
    expect(cellHintAt(state)).toBeNull();
  });

  it('does not show while several cells are selected', () => {
    const doc = docOf(table([cell(null, empty), cell(null, empty)]));
    expect(cellHintAt(cellsFrom(doc, 0, 1))).toBeNull();
  });
});
