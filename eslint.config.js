import js from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import boundariesPlugin from 'eslint-plugin-boundaries';

export default [
  {
    ignores: ['scripts/templates/**/*', 'packages/mastishk/templates/**/*'],
  },
  js.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      prettier: prettierPlugin,
      boundaries: boundariesPlugin,
    },
    rules: {
      'no-unused-vars': 'error',
      'no-console': 'warn',
      'prettier/prettier': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'interface', allow: ['application'] },
            {
              from: 'application',
              allow: ['core', 'infrastructure', 'auth', 'shared'],
            },
            {
              from: 'capabilities',
              allow: ['infrastructure', 'auth', 'shared'],
            },
            { from: 'core', allow: ['infrastructure', 'auth', 'shared'] },
            { from: 'infrastructure', allow: ['shared'] },
            { from: 'auth', allow: ['shared'] },
            { from: 'shared', allow: [] },
          ],
        },
      ],
    },
    settings: {
      'boundaries/elements': [
        { type: 'interface', pattern: 'apps/*/interface/**' },
        { type: 'application', pattern: 'apps/*/application/**' },
        { type: 'capabilities', pattern: 'apps/*/capabilities/**' },
        { type: 'core', pattern: 'packages/core/**' },
        { type: 'infrastructure', pattern: 'packages/infrastructure/**' },
        { type: 'auth', pattern: 'packages/auth/**' },
        { type: 'shared', pattern: 'packages/shared/**' },
      ],
    },
  },
  {
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
