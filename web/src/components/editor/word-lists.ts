// SPDX-License-Identifier: Apache-2.0
// Word writes a list as paragraphs, each with a typed sign in front, and our blocks need the real
// thing (EDT-138). The paste is changed in the detached document that ProseMirror parses it into,
// just before the editor's schema reads it, so the marker's words come from the parsed document.
import { Extension } from '@tiptap/core';
import { DOMParser as SchemaParser, type ParseOptions, type Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const WORD_LIST_CLASS = /^MsoListParagraph/i;
// Word wraps the typed sign in a conditional comment, which the HTML parser keeps as a comment.
const MARKER_START = /^\[if !supportLists\]$/i;
const MARKER_END = /^\[endif\]$/i;
const NUMBERED_MARKER = /\d|[a-z][.)]/i;

function isWordListItem(node: Node | null): node is Element {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    node.nodeName === 'P' &&
    Array.from((node as Element).classList).some((name) => WORD_LIST_CLASS.test(name))
  );
}

/** The next sibling that is not only white space between two paragraphs. */
function nextNode(node: Node): Node | null {
  let next = node.nextSibling;
  while (next?.nodeType === Node.TEXT_NODE && (next.textContent ?? '').trim() === '') next = next.nextSibling;
  return next;
}

/** The typed sign of an item: its opening comment, what lies between, and its closing comment. */
function markerOf(item: Element): ChildNode[] {
  const nodes = Array.from(item.childNodes);
  const start = nodes.findIndex(
    (node) => node.nodeType === Node.COMMENT_NODE && MARKER_START.test(node.textContent ?? ''),
  );
  if (start < 0) return [];
  const end = nodes.findIndex(
    (node, index) =>
      index > start && node.nodeType === Node.COMMENT_NODE && MARKER_END.test(node.textContent ?? ''),
  );
  return end < 0 ? [] : nodes.slice(start, end + 1);
}

/** Replaces one run of Word's list paragraphs by a list; the first sign says which kind. */
function listOfRun([first, ...rest]: [Element, ...Element[]]) {
  const run = [first, ...rest];
  const doc = first.ownerDocument;
  const words = markerOf(first)
    .map((node) => (node.nodeType === Node.COMMENT_NODE ? '' : (node.textContent ?? '')))
    .join('')
    .trim();
  const list = doc.createElement(NUMBERED_MARKER.test(words) ? 'ol' : 'ul');
  for (const item of run) {
    for (const node of markerOf(item)) node.remove();
    const line = doc.createElement('li');
    line.append(...Array.from(item.childNodes));
    list.append(line);
  }
  first.before(list);
  for (const item of run) item.remove();
}

/** Turns every run of Word's list paragraphs under root into one real list. */
export function makeWordLists(root: Element) {
  const done = new Set<Element>();
  for (const first of Array.from(root.querySelectorAll('p'))) {
    if (done.has(first) || !isWordListItem(first)) continue;
    const run: [Element, ...Element[]] = [first];
    done.add(first);
    for (let node = nextNode(first); isWordListItem(node); node = nextNode(node)) {
      run.push(node);
      done.add(node);
    }
    listOfRun(run);
  }
}

/** The schema's own parser, which first turns Word's lists into lists. */
class PasteParser extends SchemaParser {
  override parseSlice(dom: Node, options?: ParseOptions): Slice {
    if (dom.nodeType === Node.ELEMENT_NODE) makeWordLists(dom as Element);
    return super.parseSlice(dom, options);
  }
}

/** Pasted and dropped Word lists arrive as lists in the page editor. */
export const PastedWordLists = Extension.create({
  name: 'pastedWordLists',
  addProseMirrorPlugins() {
    const { schema } = this.editor;
    return [
      new Plugin({
        key: new PluginKey('pastedWordLists'),
        props: { clipboardParser: new PasteParser(schema, SchemaParser.fromSchema(schema).rules) },
      }),
    ];
  },
});
