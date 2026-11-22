// SPDX-License-Identifier: Apache-2.0
// Mutation testing of the frontend logic (spec 097): Stryker changes the code in small ways
// and checks that a unit test fails each time. The files below are the rules and parsers
// that decide what a person sees or may do; the ratchet in scripts/stryker-ratchet.txt keeps
// each file's score from falling.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  coverageAnalysis: 'perTest',
  mutate: [
    // What a person may do, as the screens show it.
    'src/capabilities.ts',
    'src/create-permission.ts',
    'src/permission-words.ts',
    'src/components/restriction-state.ts',
    // Addresses and messages from outside the page.
    'src/components/editor/shared-clean.ts',
    'src/components/frame-messages.ts',
    // Search.
    'src/components/search-filters.ts',
    'src/views/admin-search.ts',
    // Documents, templates and tables.
    'src/template-conditions.ts',
    'src/template-fields.ts',
    'src/kept-fields.ts',
    'src/components/editor/table-rules.ts',
    'src/components/editor/dynamic/kinds.ts',
    'src/components/sheet/csv.ts',
    'src/components/sheet/formula.ts',
    'src/components/tree-model.ts',
  ],
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  clearTextReporter: { allowColor: false, logTests: false, reportScoreTable: true },
  // The ratchet decides, file by file; a single number for all files would let one file
  // fall while another rose.
  thresholds: { high: 80, low: 60, break: null },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
