// SPDX-License-Identifier: Apache-2.0
import tseslint from 'typescript-eslint';

const noInjectedHTML = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: 'Never inject HTML. Content is rendered by the editor from the checked document.',
};

// Spec 094, D13: every address of a page is built by pagePath in src/addresses.ts. A call to the
// API names /pages/... too, so a template or string handed straight to api.something is allowed.
const handBuiltPageAddress = 'Build the address of a page with pagePath from src/addresses.ts (spec 094).';
const pageAddressRules = [
  {
    selector:
      "TemplateElement[value.raw='/pages/']:not(CallExpression[callee.object.name='api'] > TemplateLiteral > TemplateElement)",
    message: handBuiltPageAddress,
  },
  {
    selector:
      "Literal[value='/pages/']:not(CallExpression[callee.object.name='api'] > BinaryExpression > Literal)",
    message: handBuiltPageAddress,
  },
];

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': ['error', noInjectedHTML],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/addresses.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': ['error', noInjectedHTML, ...pageAddressRules],
    },
  },
);
