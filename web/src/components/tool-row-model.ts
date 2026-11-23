// SPDX-License-Identifier: Apache-2.0
// What the row of tools above a list shows (spec 100, ADM-103), apart from how it is drawn.
import type { ReactNode } from 'react';

export interface ChoiceOption {
  value: string;
  label: string;
}

/** Whether a filter stands in the row itself or on the line that More filters shows. */
export type FilterPlace = 'row' | 'more';

/**
 * One filter of a list. A choice among fixed values opens a menu; a field, such as a date
 * range or a person, opens a small panel with the field in it and may set several parameters.
 */
export type ToolFilter =
  | {
      kind: 'choice';
      param: string;
      label: string;
      icon: ReactNode;
      place: FilterPlace;
      options: ChoiceOption[];
    }
  | {
      kind: 'field';
      params: readonly string[];
      label: string;
      icon: ReactNode;
      place: FilterPlace;
      /** The value in words, such as a person's name or a range of days. */
      valueText: string;
      field: ReactNode;
    };

/** A filter of fixed values, each named in words. */
export function choiceFilter<Value extends string | number>({
  param,
  label,
  icon,
  place,
  values,
  name,
}: {
  param: string;
  label: string;
  icon: ReactNode;
  place: FilterPlace;
  values: readonly Value[];
  name: (value: Value) => string;
}): ToolFilter {
  return {
    kind: 'choice',
    param,
    label,
    icon,
    place,
    options: values.map((v) => ({ value: String(v), label: name(v) })),
  };
}

export function paramsOf(filter: ToolFilter): readonly string[] {
  return filter.kind === 'choice' ? [filter.param] : filter.params;
}

export function isFilterSet(filter: ToolFilter, params: URLSearchParams): boolean {
  return paramsOf(filter).some((key) => Boolean(params.get(key)));
}

/** The value of a set filter in words: the chosen option's name, or what the field says. */
function valueWords(filter: ToolFilter, params: URLSearchParams): string {
  if (filter.kind === 'field') return filter.valueText;
  const value = params.get(filter.param) ?? '';
  return filter.options.find((o) => o.value === value)?.label ?? value;
}

/** What a filter's button says: its name, and once set its value in words (ADM-103). */
export function filterWords(
  filter: ToolFilter,
  params: URLSearchParams,
  setWords: (name: string, value: string) => string,
): string {
  if (!isFilterSet(filter, params)) return filter.label;
  return setWords(filter.label, valueWords(filter, params));
}

/** The line of more filters shows when opened, and by itself while one of its filters is set (D3). */
export function moreLineShown(filters: ToolFilter[], params: URLSearchParams, opened: boolean): boolean {
  return opened || filters.some((f) => f.place === 'more' && isFilterSet(f, params));
}

/** Every parameter the row sets, which Reset takes away again. */
export function rowParams(
  searchParam: string | null,
  filters: ToolFilter[],
  sortParam: string | null,
): string[] {
  return [
    ...(searchParam ? [searchParam] : []),
    ...filters.flatMap((f) => [...paramsOf(f)]),
    ...(sortParam ? [sortParam] : []),
  ];
}

/** Whether anything of the row is set, so Reset has something to do. */
export function anythingSet(params: URLSearchParams, keys: readonly string[]): boolean {
  return keys.some((key) => Boolean(params.get(key)));
}
