import js from '@eslint/js';
import astroParser from 'astro-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import astro from 'eslint-plugin-astro';
import vue from 'eslint-plugin-vue';
import vueA11y from 'eslint-plugin-vuejs-accessibility';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

// The accessibility rules ship as errors. They land as warnings so today's
// templates pass, and `--max-warnings` in the `lint` script is the ratchet that
// stops the count growing (see .github/workflows/check.yml).
const vueA11yAsWarnings = vueA11y.configs['flat/recommended'].map((config) =>
  config.rules
    ? {
        ...config,
        rules: Object.fromEntries(
          Object.keys(config.rules).map((rule) => [rule, 'warn']),
        ),
      }
    : config,
);

export default tseslint.config(
  {
    // `backend/` carries its own toolchain (Workers globals, its own tsconfig),
    // so it is linted from inside that package rather than by the frontend's
    // config. `shared/` is plain TypeScript and stays in scope for both.
    ignores: [
      'dist/**',
      'node_modules/**',
      '.astro/**',
      'backend/**',
      '.wrangler/**',
      // The owner's hand-built v2 mock-up: reference material, not source.
      'docs/design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  ...vueA11yAsWarnings,
  ...astro.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,ts,vue,astro}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'vue/multi-word-component-names': 'off',
      // Ratcheted like the accessibility rules above: styles belong in the
      // component's <style> block or a class, not in `style="..."`.
      'vue/no-static-inline-styles': 'warn',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        extraFileExtensions: ['.astro'],
      },
    },
  },
  eslintConfigPrettier,
);
