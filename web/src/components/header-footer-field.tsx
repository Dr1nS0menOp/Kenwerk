// SPDX-License-Identifier: Apache-2.0
// The field that writes the installation's header or footer (spec 089, ADM-149): a small editor
// that offers exactly what the server stores (D2, D21). Its schema holds paragraphs, words, line
// breaks and status marks, with bold, italic, underline, a named text colour and links, so pasted
// content is cut down to that before anyone saves it; the server checks it again either way.
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Extension, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { Json } from '../api';
import { Status } from './editor/inline';
import { TextColor } from './editor/marks';
import { MARK_COLORS, TEXT_COLORS } from './editor/palette';
import {
  IconAlignCenter,
  IconAlignEnd,
  IconAlignStart,
  IconBold,
  IconItalic,
  IconLink,
  IconStatus,
  IconTextColor,
  IconUnderline,
} from './icons';
import { noteLink } from './instance-note';
import { Menu, MenuItem } from './menu';
import { Dialog, Field } from './ui';

const TOOL_ICON_SIZE = 16;
/** As an object: an empty string would go through an HTML parser, which the policy refuses. */
export const EMPTY_NOTE: Json = { type: 'doc', content: [{ type: 'paragraph' }] };
/** The longest status words the server keeps, in bytes, read as characters here. */
const MAX_STATUS_WORDS = 40;

/** Alignment and direction of a line, the only attributes a line of the band keeps. */
const NoteLines = Extension.create({
  name: 'noteLines',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('dir'),
            renderHTML: (attrs: Record<string, unknown>) => (attrs.dir ? { dir: attrs.dir } : {}),
          },
          align: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-align'),
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.align ? { 'data-align': attrs.align } : {},
          },
        },
      },
    ];
  },
});

/** Everything a header or footer can hold, and nothing else. */
export function noteExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        protocols: ['https', 'mailto'],
        isAllowedUri: (url) => noteLink(url).kind !== 'refused',
      },
    }),
    Status,
    TextColor,
    NoteLines,
  ];
}

function Tool({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Asks for the address of a link on the selected words, or takes the link away. */
function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation();
  const [address, setAddress] = useState((editor.getAttributes('link').href as string | undefined) ?? '');
  const allowed = noteLink(address.trim()).kind !== 'refused';
  // The dialog sits inside the form of the section, so it has no form of its own: a submit here
  // would set off the section's Save.
  const save = () => {
    if (!allowed) return;
    const href = address.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onClose();
  };
  return (
    <Dialog title={t('headerFooter.linkTitle')} onClose={onClose}>
      <div>
        <Field label={t('headerFooter.linkAddress')} help={t('headerFooter.linkHelp')}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              save();
            }}
          />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="primary" disabled={!allowed} onClick={save}>
            {t('common.save')}
          </button>
          {editor.isActive('link') && (
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                onClose();
              }}
            >
              {t('headerFooter.linkRemove')}
            </button>
          )}
          <button type="button" className="quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Turns the selected words into a status mark of a colour, as a classification line needs. */
function makeStatus(editor: Editor, color: string, fallback: string) {
  const { from, to } = editor.state.selection;
  const words = editor.state.doc.textBetween(from, to, ' ').trim().slice(0, MAX_STATUS_WORDS) || fallback;
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, { type: 'status', attrs: { text: words, color } })
    .run();
}

function Colours({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  return (
    <>
      <Menu label={t('editor.textColor')} trigger={<IconTextColor size={TOOL_ICON_SIZE} />} align="start">
        <MenuItem onClick={() => editor.chain().focus().unsetMark('textColor').run()}>
          {t('editor.defaultColor')}
        </MenuItem>
        {TEXT_COLORS.map((color) => (
          <MenuItem key={color} onClick={() => editor.chain().focus().setMark('textColor', { color }).run()}>
            <span className={`text-${color}`}>{t(`editor.colors.${color}`)}</span>
          </MenuItem>
        ))}
      </Menu>
      <Menu label={t('headerFooter.status')} trigger={<IconStatus size={TOOL_ICON_SIZE} />} align="start">
        {MARK_COLORS.map((color) => (
          <MenuItem key={color} onClick={() => makeStatus(editor, color, t('headerFooter.statusWords'))}>
            <span className={`status-mark mark-${color}`}>{t(`editor.colors.${color}`)}</span>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

const ALIGNMENTS = [
  { align: null, label: 'editor.alignStart', Icon: IconAlignStart },
  { align: 'center', label: 'editor.alignCenter', Icon: IconAlignCenter },
  { align: 'end', label: 'editor.alignEnd', Icon: IconAlignEnd },
] as const;

function Tools({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const { t } = useTranslation();
  const chain = () => editor.chain().focus();
  const align = (editor.getAttributes('paragraph').align as string | null | undefined) ?? null;
  return (
    <div className="comment-tools" role="toolbar" aria-label={t('editor.toolbar')}>
      <Tool
        label={t('editor.bold')}
        active={editor.isActive('bold')}
        onClick={() => chain().toggleBold().run()}
      >
        <IconBold size={TOOL_ICON_SIZE} />
      </Tool>
      <Tool
        label={t('editor.italic')}
        active={editor.isActive('italic')}
        onClick={() => chain().toggleItalic().run()}
      >
        <IconItalic size={TOOL_ICON_SIZE} />
      </Tool>
      <Tool
        label={t('editor.underline')}
        active={editor.isActive('underline')}
        onClick={() => chain().toggleUnderline().run()}
      >
        <IconUnderline size={TOOL_ICON_SIZE} />
      </Tool>
      <Colours editor={editor} />
      <Tool label={t('headerFooter.link')} active={editor.isActive('link')} onClick={onLink}>
        <IconLink size={TOOL_ICON_SIZE} />
      </Tool>
      {ALIGNMENTS.map(({ align: value, label, Icon }) => (
        <Tool
          key={label}
          label={t(label)}
          active={align === value}
          onClick={() => chain().updateAttributes('paragraph', { align: value }).run()}
        >
          <Icon size={TOOL_ICON_SIZE} />
        </Tool>
      ))}
    </div>
  );
}

/**
 * The header or footer field: a bold label above a small editor, with its hint below. It starts
 * from value; to show another value, such as the stored one after Reset changes, give it a new key.
 */
export function HeaderFooterField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: Json | null;
  onChange: (next: Json | null) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  const [linking, setLinking] = useState(false);
  const editor = useEditor({
    extensions: noteExtensions(),
    content: value ?? EMPTY_NOTE,
    injectCSS: false,
    // The tools show what the cursor stands in, so they follow every change of the selection.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'comment-input header-footer-input',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        'aria-describedby': hintId,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? null : (e.getJSON() as Json)),
  });
  return (
    <div className="field header-footer-field">
      <span id={labelId}>{label}</span>
      <div className="comment-box">
        <Tools editor={editor} onLink={() => setLinking(true)} />
        <EditorContent editor={editor} />
      </div>
      <small className="muted" id={hintId}>
        {hint}
      </small>
      {linking && <LinkDialog editor={editor} onClose={() => setLinking(false)} />}
    </div>
  );
}
