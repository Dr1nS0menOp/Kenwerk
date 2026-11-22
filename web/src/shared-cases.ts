// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Reads a file of the Go code by its path from the root of the repository. For tests only.
 * Stryker runs the tests in a copy of web/ that has no Go code beside it, so there
 * KENWERK_REPO names the repository (spec 097).
 */
export function readRepoFile(path: string): string {
  const repo = process.env.KENWERK_REPO;
  const root = repo ? pathToFileURL(`${repo}/`) : new URL('../../', import.meta.url);
  return readFileSync(new URL(path, root), 'utf8');
}

/** Reads a table of cases that the Go code runs as well. */
export function readSharedCases(path: string): unknown {
  return JSON.parse(readRepoFile(path));
}
