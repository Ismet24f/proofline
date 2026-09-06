const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/lib/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['packages/*/src/**/*.ts', 'check/src/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
);
