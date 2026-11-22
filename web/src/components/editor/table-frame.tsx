// SPDX-License-Identifier: Apache-2.0
// What the table with the cursor has around it while writing (spec 082, EDT-209 to EDT-216):
// an outline, a button in the cell, a bar under it, faint handles and an edge to stretch it.
// Nothing for tables appears in the row of tools (EDT-161).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorState, type Editor } from '@tiptap/react';
import { FIXED_BARS } from '../menu';
import {
  cellOfPosition,
  commitStretch,
  enterTable,
  FULL_STRETCH,
  isTopLevel,
  selectWholeTable,
  STRETCH_STEP,
  stretchFromPointer,
  tableAround,
  tableAt,
  type TableCell,
} from './table';
import { SelectAllButton, TableBar } from './table-bar';
import { CellMenu } from './table-cell-menu';
import { TableLines } from './table-lines';

interface Box {
  pos: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

function tableBox(editor: Editor, pos: number, sheet: HTMLElement): Box | null {
  if (!tableAt(editor, pos)) return null;
  const wrapper = editor.view.nodeDOM(pos);
  if (!(wrapper instanceof HTMLElement)) return null;
  const outer = sheet.getBoundingClientRect();
  const box = wrapper.getBoundingClientRect();
  return {
    pos,
    top: box.top - outer.top,
    left: box.left - outer.left,
    width: box.width,
    height: box.height,
  };
}

/** The table around this element, as a position in the document. */
function tableOf(editor: Editor, element: Element): number | null {
  const wrapper = element.closest('.tableWrapper');
  if (!wrapper) return null;
  const inside = editor.view.posAtDOM(wrapper, 0);
  const $pos = editor.state.doc.resolve(inside);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    if ($pos.node(depth).type.name === 'table') return $pos.before(depth);
  }
  const after = $pos.nodeAfter;
  return after?.type.name === 'table' ? inside : null;
}

function cellUnder(editor: Editor, table: number, element: Element): TableCell | null {
  const cell = element.closest('td,th');
  return cell ? cellOfPosition(editor, table, editor.view.posAtDOM(cell, 0)) : null;
}

/** The table with the cursor, which alone has the controls (EDT-216), and the cell under the pointer. */
export function useTableTracking(editor: Editor, sheet: RefObject<HTMLDivElement | null>) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [hoveredCell, setHoveredCell] = useState<TableCell | null>(null);
  const pos = useEditorState({ editor, selector: (s) => tableAround(s.editor)?.pos ?? null });

  const measure = useCallback(() => {
    setBox(pos !== null && sheet.current ? tableBox(editor, pos, sheet.current) : null);
  }, [editor, pos, sheet]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    editor.on('transaction', measure);
    window.addEventListener('resize', measure);
    // Putting the sidebar away changes the room, and so the bars, without resizing the window.
    const bars = new ResizeObserver(measure);
    document.querySelectorAll(FIXED_BARS).forEach((bar) => bars.observe(bar));
    // A wide table scrolls in its own frame, and the handles go along with their line.
    document.addEventListener('scroll', measure, { capture: true, passive: true });
    return () => {
      editor.off('transaction', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, { capture: true });
      bars.disconnect();
    };
  }, [editor, measure]);

  // An open menu keeps its line, or reaching for it would change what it acts on.
  const hasOpenMenu = () => root.current?.querySelector('[aria-expanded="true"]') != null;
  const click = (selector: string) => root.current?.querySelector<HTMLElement>(selector)?.click();
  return {
    root,
    box,
    hoveredCell,
    measure,
    track: (e: MouseEvent<HTMLElement>) => {
      const target = e.target as Element;
      if (root.current?.contains(target) || hasOpenMenu()) return;
      const table = tableOf(editor, target);
      const next = table === null || table !== pos ? null : cellUnder(editor, table, target);
      setHoveredCell((now) => (now?.row === next?.row && now?.column === next?.column ? now : next));
    },
    leave: () => setHoveredCell(null),
    forgetCell: () => setHoveredCell(null),
    /** More of the table bar, for Ctrl Shift . (EDT-215). */
    openMore: () => click('.table-bar > .menu:last-child > [aria-haspopup]'),
    /** The cell menu, for Shift F10 and the menu key (EDT-199). */
    openCell: () => click('.table-cell-button'),
  };
}

type Tracker = ReturnType<typeof useTableTracking>;

/** The edge of the table. Dragging has the width chooser and the arrow keys beside it (WCAG 2.5.7). */
function StretchEdge({ editor, pos, onMove }: { editor: Editor; pos: number; onMove: () => void }) {
  const { t } = useTranslation();
  const stored = useEditorState({
    editor,
    selector: (s) => (tableAt(s.editor, pos)?.attrs.stretch as number | null) ?? 0,
  });
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = dragged ?? stored;

  const wrapper = () => editor.view.nodeDOM(pos) as HTMLElement | null;
  const preview = (next: number) => {
    setDragged(next);
    wrapper()?.style.setProperty('--table-stretch', String(next));
    onMove();
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const steps: Record<string, number> = {
      ArrowRight: stored + (rtl ? -STRETCH_STEP : STRETCH_STEP),
      ArrowLeft: stored + (rtl ? STRETCH_STEP : -STRETCH_STEP),
      Home: 0,
      End: FULL_STRETCH,
    };
    const next = steps[e.key];
    if (next === undefined) return;
    e.preventDefault();
    commitStretch(editor, pos, Math.min(FULL_STRETCH, Math.max(0, next)));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      className="table-edge"
      aria-orientation="vertical"
      aria-label={t('table.width')}
      aria-valuemin={0}
      aria-valuemax={FULL_STRETCH}
      aria-valuenow={shown}
      onKeyDown={keys}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragged(stored);
      }}
      onPointerMove={(e) => {
        if (dragged !== null) preview(stretchFromPointer(editor, e.clientX));
      }}
      onPointerUp={(e) => {
        if (dragged === null) return;
        const next = stretchFromPointer(editor, e.clientX);
        setDragged(null);
        commitStretch(editor, pos, next);
      }}
    />
  );
}

export function TableFrame({ editor, tracker }: { editor: Editor; tracker: Tracker }) {
  const { box, root, measure, hoveredCell, forgetCell } = tracker;
  const canStretch = useEditorState({
    editor,
    selector: (s) => (box ? isTopLevel(s.editor, box.pos) : false),
  });

  useLayoutEffect(() => {
    const frame = root.current;
    if (!frame || !box) return;
    frame.style.top = `${box.top}px`;
    frame.style.left = `${box.left}px`;
    frame.style.width = `${box.width}px`;
    frame.style.height = `${box.height}px`;
  }, [box, root]);

  if (!box) return null;
  return (
    <div ref={root} className="table-frame active" onClickCapture={() => enterTable(editor, box.pos)}>
      <SelectAllButton onSelect={() => selectWholeTable(editor, box.pos)} />
      {canStretch && <StretchEdge editor={editor} pos={box.pos} onMove={measure} />}
      {/* After the edge, so a plus on the edge stays within reach. */}
      <TableLines
        editor={editor}
        pos={box.pos}
        hovered={hoveredCell}
        frame={root}
        layout={box}
        onMoved={forgetCell}
      />
      <CellMenu editor={editor} frame={root} layout={box} />
      <TableBar editor={editor} pos={box.pos} />
    </div>
  );
}
