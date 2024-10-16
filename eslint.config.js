import es6 from '@cto.af/eslint-config/es6.js';
import globals from '@cto.af/eslint-config/globals.js';
import jsdoc from '@cto.af/eslint-config/jsdoc.js';
import jts from '@cto.af/eslint-config/jsdoc_ts.js';
import markdown from '@cto.af/eslint-config/markdown.js';
import mod from '@cto.af/eslint-config/module.js';
import ts from '@cto.af/eslint-config/ts.js';

export default [
  {
    ignores: [
      '**/*.d.ts',
      'lib/**',
      'docs/**',
      'test/fixtures/**', // Intentionally invalid
    ],
  },
  ...es6,
  ...mod,
  ...ts,
  ...jsdoc,
  ...jts,
  ...markdown,
  {
    files: [
      'src/client.ts',
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-console': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
];
