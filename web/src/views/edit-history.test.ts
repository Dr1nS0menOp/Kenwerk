// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { pickVersion } from './edit-history';

describe('choosing versions to compare in the editor (EDT-172)', () => {
  it('keeps two at most, and lets go of the oldest choice', () => {
    expect(pickVersion([], 3)).toEqual([3]);
    expect(pickVersion([3], 1)).toEqual([3, 1]);
    expect(pickVersion([3, 1], 2)).toEqual([1, 2]);
  });

  it('lets go of a version chosen again', () => {
    expect(pickVersion([3, 1], 3)).toEqual([1]);
  });
});
