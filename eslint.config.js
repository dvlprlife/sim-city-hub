// Flat ESLint config for the whole repo: the Node backend (src/, test/) and the
// React frontend (client/src/). One config at the root so CI's existing
// `npm run lint --if-present` step lints everything. Parsing JSX needs no extra
// parser — espree handles it via ecmaFeatures.jsx.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'client/public/**'] },

  js.configs.recommended,

  // Project-wide rule tweaks. Empty catches are an intentional best-effort
  // pattern; leading-underscore names mark deliberately-unused bindings (e.g.
  // destructure-to-omit, ignored catch values).
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // Backend + tooling scripts — Node, ESM.
  {
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Node tooling scripts written as CommonJS (.cjs) — require/__dirname/module.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Frontend — browser + React hooks rules.
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    // The classic, high-value hooks rules. We skip the plugin's newer
    // React-Compiler rules (set-state-in-effect, refs) — they flag idiomatic
    // data-loading effects and documented ref patterns used throughout here.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Test files also see Node globals (vitest/node:test symbols are imported).
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
];
