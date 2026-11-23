// SPDX-License-Identifier: Apache-2.0
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconSettings } from './icons';

const CENTRE = 12;
const TEETH = 8;

/** The shapes of an icon's path, each from its own move. */
function shapesOf(markup: string): string[] {
  const path = markup.match(/ d="([^"]+)"/)?.[1] ?? '';
  return path.split(/(?=M)/).filter((shape) => shape.trim() !== '');
}

/** How far from the centre each corner of a shape lies, after a move, line or arc. */
function cornerDistances(shape: string): number[] {
  return [...shape.matchAll(/([MLA])([^MLAz]+)/g)].map(([, command, numbers = '']) => {
    const values = numbers
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const [x = NaN, y = NaN] = command === 'A' ? values.slice(5) : values;
    return Math.hypot(x - CENTRE, y - CENTRE);
  });
}

describe('the settings button of the top bar', () => {
  it('draws a gear: a closed rim with eight teeth around a hub, not a ring of rays', () => {
    const shapes = shapesOf(renderToStaticMarkup(<IconSettings />));
    expect(shapes).toHaveLength(2);
    expect(shapes.every((shape) => shape.trim().endsWith('z'))).toBe(true);
    const distances = cornerDistances(shapes[0] ?? '');
    const outermost = Math.max(...distances);
    const tips = distances.filter((distance) => distance > outermost - 0.5);
    expect(tips).toHaveLength(2 * TEETH);
    expect(Math.min(...distances)).toBeLessThan(outermost - 1.5);
  });
});
