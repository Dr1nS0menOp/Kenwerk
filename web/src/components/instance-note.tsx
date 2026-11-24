// SPDX-License-Identifier: Apache-2.0
// The installation's header and footer on a page (spec 089, ADM-147): a few lines an administrator
// wrote once, above and below the document of every page and blog post. React builds the DOM from
// the small subset the server allows (D2, D24): no HTML of the stored content reaches the browser,
// a node or mark it does not know becomes plain words or nothing, and every link that leaves the
// installation shows its host, so its words can never hide where it goes (D3).
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useCapabilities } from '../capabilities';
import { Link } from '../router';
import { MARK_COLORS, TEXT_COLORS } from './editor/palette';
import { IconExternal } from './icons';

const OUTWARD_ICON_SIZE = 12;
/** The answer is the same for every page, so a tab asks at most once a minute (load budget). */
const NOTE_STALE_MS = 60_000;

interface NoteMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** One node of a stored header or footer, as the server checked it. */
export interface NoteNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: NoteNode[];
  marks?: NoteMark[];
}

/** What every reader reads: each field a document, or null when it is empty. */
export interface HeaderFooter {
  header: NoteNode | null;
  footer: NoteNode | null;
  version: string;
}

export const headerFooterKey = ['header-footer'];

/** Where a link of the band goes, by the rule the server holds (D3). */
export type NoteLink =
  | { kind: 'outside'; href: string; host: string }
  | { kind: 'mail'; href: string }
  | { kind: 'inside'; href: string }
  | { kind: 'refused' };

const PLAIN_HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const ONE_MAIL_ADDRESS = /^mailto:[^@\s,;?&/]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/i;
const HTTPS_ADDRESS = /^https:\/\/([^/?#]*)(?:[/?#].*)?$/i;
const PORT = /^\d*$/;
const LAST_CONTROL_CHARACTER = 0x20;
const DELETE_CHARACTER = 0x7f;

/** Whether an address holds a space, a backslash or a control character. */
function hasHiddenCharacter(href: string): boolean {
  for (const character of href) {
    const code = character.codePointAt(0) ?? 0;
    if (code < LAST_CONTROL_CHARACTER || code === DELETE_CHARACTER || /[\s\\]/u.test(character)) return true;
  }
  return false;
}

/** The host of an https address with a plain host name and no user part, or null for any other. */
function plainHttpsHost(href: string): string | null {
  const authority = HTTPS_ADDRESS.exec(href)?.[1];
  if (authority === undefined || authority.includes('@')) return null;
  const [host = '', port = '', ...rest] = authority.split(':');
  return rest.length === 0 && PORT.test(port) && PLAIN_HOST.test(host) ? host.toLowerCase() : null;
}

/** Sorts an address the way the server's rule does: https outside, one mail address, a path inside. */
export function noteLink(href: string): NoteLink {
  if (hasHiddenCharacter(href)) return { kind: 'refused' };
  if (href.startsWith('/')) return href.startsWith('//') ? { kind: 'refused' } : { kind: 'inside', href };
  if (ONE_MAIL_ADDRESS.test(href)) return { kind: 'mail', href };
  const host = plainHttpsHost(href);
  return host ? { kind: 'outside', href, host } : { kind: 'refused' };
}

function NoteAnchor({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useTranslation();
  const link = noteLink(href);
  switch (link.kind) {
    case 'inside':
      return <Link href={link.href}>{children}</Link>;
    case 'mail':
      return <a href={link.href}>{children}</a>;
    case 'outside':
      return (
        <a href={link.href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
          <span className="note-host"> ({link.host})</span>
          <span className="note-outward-mark" aria-hidden="true">
            <IconExternal size={OUTWARD_ICON_SIZE} />
          </span>
          <span className="visually-hidden">{t('headerFooter.opensElsewhere')}</span>
        </a>
      );
    default:
      return <>{children}</>;
  }
}

const isTextColor = (color: unknown): color is string => (TEXT_COLORS as readonly unknown[]).includes(color);
const isMarkColor = (color: unknown): color is string => (MARK_COLORS as readonly unknown[]).includes(color);

/** Wraps words in one mark; a mark the subset does not hold leaves them plain. */
function withMark(mark: NoteMark, inner: ReactNode): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong>{inner}</strong>;
    case 'italic':
      return <em>{inner}</em>;
    case 'underline':
      return <u>{inner}</u>;
    case 'textColor': {
      const color = mark.attrs?.color;
      return isTextColor(color) ? <span className={`text-${color}`}>{inner}</span> : inner;
    }
    case 'link': {
      const href = mark.attrs?.href;
      return typeof href === 'string' ? <NoteAnchor href={href}>{inner}</NoteAnchor> : inner;
    }
    default:
      return inner;
  }
}

/** One item of a line: words with their marks, a status mark or a line break. */
function inlineItem(node: NoteNode, key: number): ReactNode {
  if (node.type === 'hardBreak') return <br key={key} />;
  if (node.type === 'status') {
    const color = node.attrs?.color;
    const words = typeof node.attrs?.text === 'string' ? node.attrs.text : '';
    return isMarkColor(color) && words ? (
      <span key={key} className={`status-mark mark-${color}`}>
        {words}
      </span>
    ) : null;
  }
  if (node.type !== 'text' || !node.text) return null;
  // The first mark is the outermost, as the editor nests them.
  const marks = [...(node.marks ?? [])].reverse();
  return <span key={key}>{marks.reduce<ReactNode>((inner, mark) => withMark(mark, inner), node.text)}</span>;
}

const ALIGNMENTS = ['center', 'end'];
const DIRECTIONS = ['ltr', 'rtl'];

/** The lines of a header or footer; anything but a paragraph becomes nothing. */
export function NoteContent({ doc }: { doc: NoteNode }) {
  return (
    <>
      {(doc.content ?? []).map((block, i) => {
        if (block.type !== 'paragraph') return null;
        const align = ALIGNMENTS.includes(String(block.attrs?.align))
          ? String(block.attrs?.align)
          : undefined;
        const dir = DIRECTIONS.includes(String(block.attrs?.dir)) ? String(block.attrs?.dir) : undefined;
        return (
          <p key={i} data-align={align} dir={dir}>
            {(block.content ?? []).map(inlineItem)}
          </p>
        );
      })}
    </>
  );
}

/**
 * The header above or the footer below the document of a page or blog post. It shows nothing
 * while the part is off, while there is nothing to show, and when it cannot be read: a missing
 * note must never keep anyone from the page (D14).
 */
export function InstanceNote({ place }: { place: 'above' | 'below' }) {
  const { t } = useTranslation();
  const on = useCapabilities().header_footer;
  const note = useQuery({
    queryKey: headerFooterKey,
    queryFn: () => api.get<HeaderFooter>('/header-footer'),
    enabled: on,
    staleTime: NOTE_STALE_MS,
    retry: false,
  });
  const doc = place === 'above' ? note.data?.header : note.data?.footer;
  if (!on || !doc) return null;
  return (
    <section
      className={`instance-note instance-note-${place}`}
      aria-label={t(`headerFooter.region_${place}`)}
    >
      <div className="prose instance-note-text">
        <NoteContent doc={doc} />
      </div>
    </section>
  );
}
