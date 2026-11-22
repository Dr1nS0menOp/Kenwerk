// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';

export const TOOL_ICON_SIZE = 18;

/** A button in the row. Pressing it never takes the selection away from the text. */
export function Tool({
  editor,
  label,
  active,
  pressed,
  unavailable = false,
  narrow = false,
  run,
  children,
}: {
  editor: Editor;
  label: string;
  active?: string;
  pressed?: boolean;
  /**
   * Nothing to do now, such as Undo before any change. The tool keeps its place and its stop in
   * the arrow keys, and says so with aria-disabled (EDT-170, D13).
   */
  unavailable?: boolean;
  /** The arrow beside a tool, such as the size picker beside Table. */
  narrow?: boolean;
  run: () => void;
  children: ReactNode;
}) {
  const markIsOn = useEditorState({
    editor,
    selector: (s) => (active ? s.editor.isActive(active) : false),
  });
  const on = pressed ?? markIsOn;
  const isToggle = active !== undefined || pressed !== undefined;
  const classes = ['tool', narrow && 'tool-arrow', on && 'on'].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={isToggle ? on : undefined}
      aria-disabled={unavailable || undefined}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!unavailable) run();
      }}
    >
      {children}
    </button>
  );
}

export function ToolSeparator() {
  return <span className="tool-separator" />;
}
