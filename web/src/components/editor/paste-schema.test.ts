// SPDX-License-Identifier: Apache-2.0
// The editor's schema is the allow-list of a paste: ProseMirror parses pasted HTML in a detached
// document and keeps only what a parse rule of the schema reads. These tests hand every parse rule
// of the page editor and of the header and footer an element full of hostile attributes and
// styles, and hold that no event handler, no address that runs code and no style expression comes
// out as content.
import { describe, expect, it } from 'vitest';
import { getSchema, type AnyExtension } from '@tiptap/core';
import type { Attrs, Schema, TagParseRule, StyleParseRule } from '@tiptap/pm/model';
import { noteExtensions } from '../header-footer-field';
import { documentExtensions } from './extensions';
import { isSafeAddress } from './shared-clean';

const SCRIPT_ADDRESS = 'javascript:alert(1)';
const JSON_SCRIPT_ADDRESS = JSON.stringify(SCRIPT_ADDRESS);
const STYLE_EXPRESSION = 'expression(alert(1))';
const STYLE_SCRIPT_URL = 'url(javascript:alert(1))';
const HOSTILE_STYLE = `color: ${STYLE_EXPRESSION}; background: ${STYLE_SCRIPT_URL}; width: ${STYLE_EXPRESSION}`;
const HANDLERS = ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'];
const ACTIVE_STYLE = /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i;
const isAddressAttribute = (name: string) => /(^|_)(href|src|url)$/i.test(name);

/** Every attribute any type of the schema declares, under each name a parse rule may read it by. */
function attributeNames(schema: Schema): string[] {
  const types = [...Object.values(schema.nodes), ...Object.values(schema.marks)];
  const declared = types.flatMap((type) => Object.keys(type.spec.attrs ?? {}));
  const kebab = (name: string) => name.replace(/_/g, '-').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return [...new Set(declared.flatMap((name) => [name, `data-${name}`, `data-${kebab(name)}`]))];
}

/** An element as a paste could bring it, answering only with hostile values. */
function hostileElement(tag: string, names: string[], value = SCRIPT_ADDRESS): HTMLElement {
  const attributes: Record<string, string> = Object.fromEntries(names.map((name) => [name, value]));
  for (const handler of HANDLERS) attributes[handler] = 'alert(1)';
  Object.assign(attributes, { href: SCRIPT_ADDRESS, src: SCRIPT_ADDRESS, style: HOSTILE_STYLE });
  const style = new Proxy(
    { cssText: HOSTILE_STYLE, getPropertyValue: () => STYLE_EXPRESSION },
    { get: (target, key) => (key in target ? target[key as keyof typeof target] : STYLE_EXPRESSION) },
  );
  const element = {
    nodeType: 1,
    nodeName: tag.toUpperCase(),
    tagName: tag.toUpperCase(),
    style,
    textContent: '',
    innerHTML: '',
    children: [],
    childNodes: [],
    firstChild: null,
    firstElementChild: null,
    parentElement: null,
    parentNode: null,
    dataset: {},
    classList: { contains: () => false },
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    getAttribute: (name: string) => attributes[name] ?? null,
    hasAttribute: (name: string) => name in attributes,
    getAttributeNames: () => Object.keys(attributes),
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    matches: () => true,
  };
  return element as unknown as HTMLElement;
}

/**
 * What a tag rule keeps of a hostile element. Attributes that hold JSON refuse plain text by
 * throwing, which fails the paste as a whole, so such a rule is asked again with the hostile
 * address written as JSON.
 */
function tagAttributes(rule: TagParseRule, plain: HTMLElement, json: HTMLElement) {
  if (!rule.getAttrs) return rule.attrs;
  try {
    return rule.getAttrs(plain);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return rule.getAttrs(json);
  }
}

/** What each parse rule of a schema keeps of a hostile element or style. */
function parsedAttributes(schema: Schema): { rule: string; attrs: Attrs }[] {
  const names = attributeNames(schema);
  const types = [...Object.values(schema.nodes), ...Object.values(schema.marks)];
  return types.flatMap((type) =>
    (type.spec.parseDOM ?? []).flatMap((rule) => {
      const label = `${type.name} ${'tag' in rule ? (rule as TagParseRule).tag : (rule as StyleParseRule).style}`;
      let kept: Attrs | false | null | undefined;
      if ('tag' in rule && rule.tag) {
        const tag = /^[a-z0-9]+/i.exec(rule.tag)?.[0] ?? 'div';
        kept = tagAttributes(
          rule,
          hostileElement(tag, names),
          hostileElement(tag, names, JSON_SCRIPT_ADDRESS),
        );
      } else {
        const styleRule = rule as StyleParseRule;
        kept = styleRule.getAttrs ? styleRule.getAttrs(STYLE_EXPRESSION) : styleRule.attrs;
        const urlKept = styleRule.getAttrs ? styleRule.getAttrs(STYLE_SCRIPT_URL) : styleRule.attrs;
        if (urlKept)
          return [
            { rule: label, attrs: kept || {} },
            { rule: `${label} url`, attrs: urlKept },
          ];
      }
      return kept ? [{ rule: label, attrs: kept }] : [];
    }),
  );
}

function problemsOf(parsed: { rule: string; attrs: Attrs }[]): string[] {
  return parsed.flatMap(({ rule, attrs }) =>
    Object.entries(attrs).flatMap(([name, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
      const found: string[] = [];
      if (/^on/i.test(name)) found.push(`${rule}: keeps the handler ${name}`);
      if (isAddressAttribute(name) && !isSafeAddress(value)) found.push(`${rule}: ${name} runs code`);
      if (ACTIVE_STYLE.test(text)) found.push(`${rule}: ${name} keeps a style expression`);
      return found;
    }),
  );
}

const editors: [string, AnyExtension[]][] = [
  ['the page editor', documentExtensions()],
  ['the header and footer', noteExtensions()],
];

describe.each(editors)('a hostile paste into %s', (_name, extensions) => {
  const schema = getSchema(extensions);
  const parsed = parsedAttributes(schema);

  it('reaches every parse rule of the schema', () => {
    expect(parsed.length).toBeGreaterThan(5);
  });

  it('keeps no event handler, no address that runs code and no style expression', () => {
    expect(problemsOf(parsed)).toEqual([]);
  });

  it('keeps no link to a javascript: address', () => {
    const link = schema.marks.link?.spec.parseDOM?.find((rule) => 'tag' in rule) as TagParseRule | undefined;
    expect(link?.getAttrs?.(hostileElement('a', []))).toBe(false);
  });
});

describe('the check itself', () => {
  it('finds a handler, an address that runs code and a style expression', () => {
    expect(
      problemsOf([
        { rule: 'x', attrs: { onclick: 'a', href: SCRIPT_ADDRESS, style: `width: ${STYLE_EXPRESSION}` } },
      ]),
    ).toEqual(['x: keeps the handler onclick', 'x: href runs code', 'x: style keeps a style expression']);
  });
});
