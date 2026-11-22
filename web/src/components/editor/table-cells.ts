// SPDX-License-Identifier: Apache-2.0
// What the cell menu does to the cells it acts on (spec 082, EDT-210 to EDT-212, EDT-196): the
// cell with the cursor, or every selected cell. Each change is one step, so one Undo restores it.
import { Extension } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import i18n from '../../i18n';

/** Where a cell's text sits along the line. Start is stored as no alignment (D14). */
export type CellAlignment = 'start' | 'center' | 'end';

interface CellAt {
  pos: number;
  node: ProseNode;
}

const isCell = (node: ProseNode) => {
  const role = node.type.spec.tableRole as string | undefined;
  return role === 'cell' || role === 'header_cell';
};

/** The cells a change acts on: every selected cell, or the one with the cursor. */
export function cellsInSelection(state: EditorState): CellAt[] {
  const { selection } = state;
  if (selection instanceof CellSelection) {
    const cells: CellAt[] = [];
    selection.forEachCell((node, pos) => cells.push({ node, pos }));
    return cells;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (isCell(node)) return [{ node, pos: $from.before(depth) }];
  }
  return [];
}

/** Clears the text of the cells and keeps their shape and colour (EDT-211). */
export function emptyCellsStep(state: EditorState): Transaction | null {
  const cells = cellsInSelection(state);
  const paragraph = state.schema.nodes.paragraph;
  if (cells.length === 0 || !paragraph) return null;
  const { tr } = state;
  // From the end, so the positions of the cells before stay where they were.
  [...cells]
    .sort((a, b) => b.pos - a.pos)
    .forEach(({ node, pos }) => tr.replaceWith(pos + 1, pos + node.nodeSize - 1, paragraph.create()));
  return tr;
}

const ALIGNED = new Set(['paragraph', 'heading']);
const storedAlign = (align: CellAlignment) => (align === 'start' ? null : align);
const readAlign = (stored: unknown): CellAlignment =>
  stored === 'center' || stored === 'end' ? stored : 'start';

function textBlocksOf(cell: CellAt, visit: (node: ProseNode, pos: number) => void) {
  cell.node.descendants((node, offset) => {
    if (ALIGNED.has(node.type.name)) visit(node, cell.pos + 1 + offset);
    return true;
  });
}

/** Aligns every paragraph and heading in the cells (EDT-212). Logical, so it mirrors in right-to-left. */
export function alignCellsStep(state: EditorState, align: CellAlignment): Transaction | null {
  const cells = cellsInSelection(state);
  if (cells.length === 0) return null;
  const { tr } = state;
  cells.forEach((cell) =>
    textBlocksOf(cell, (node, pos) =>
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, align: storedAlign(align) }),
    ),
  );
  return tr;
}

/** The alignment every text block of the cells shares, or null when they differ. */
export function cellAlignment(state: EditorState): CellAlignment | null {
  const found = new Set<CellAlignment>();
  cellsInSelection(state).forEach((cell) =>
    textBlocksOf(cell, (node) => found.add(readAlign(node.attrs.align))),
  );
  return found.size === 1 ? ([...found][0] ?? null) : null;
}

/** The empty paragraph of the cell with the cursor that gets the hint, as a position (EDT-196). */
export function cellHintAt(state: EditorState): number | null {
  const { selection } = state;
  if (!selection.empty || selection instanceof CellSelection) return null;
  const [cell] = cellsInSelection(state);
  if (!cell || cell.node.childCount !== 1) return null;
  const only = cell.node.firstChild;
  if (only?.type.name !== 'paragraph' || only.content.size > 0) return null;
  return cell.pos + 1;
}

function hintWidget(): HTMLElement {
  const hint = document.createElement('span');
  hint.className = 'cell-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.contentEditable = 'false';
  const key = document.createElement('kbd');
  key.textContent = '/';
  hint.append(key, ` ${i18n.t('table.cellHint')}`);
  return hint;
}

const quietMenuKey = new PluginKey('quietCellMenu');

/** The mouse button that asks for a context menu; the keys that do so send another. */
const SECONDARY_BUTTON = 2;

/**
 * Shift F10 and the menu key open the cell menu in a table (EDT-199), and the browser then sends
 * the event for its own menu. That one is refused, or it would cover the cell menu and swallow
 * the next click. A right click still gets the browser's menu.
 */
export const QuietCellMenu = Extension.create({
  name: 'quietCellMenu',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: quietMenuKey,
        props: {
          handleDOMEvents: {
            contextmenu(view, event) {
              const fromKeys = event.button !== SECONDARY_BUTTON;
              if (!fromKeys || cellsInSelection(view.state).length === 0) return false;
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

const hintKey = new PluginKey('cellHint');

/** The hint in an empty cell: a decoration, so it is never stored, and gone at the first character. */
export const CellHint = Extension.create({
  name: 'cellHint',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: hintKey,
        props: {
          decorations(state) {
            const at = editor.isEditable ? cellHintAt(state) : null;
            if (at === null) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(at + 1, hintWidget, { key: 'cell-hint', side: 1, ignoreSelection: true }),
            ]);
          },
        },
      }),
    ];
  },
});
