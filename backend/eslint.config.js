/**
 * Backend ESLint flat config — Day-5 of Week-1 Stabilization (2026-04-25).
 *
 * Scope is intentionally narrow: ONLY the custom `require-entity-filter` rule.
 * No other style rules; no inheritance from the frontend config. The intent
 * is to ship the static tenant-leak guard without picking a fight with
 * 100+ controllers' worth of legacy code-style choices.
 *
 * Severity is `error` as of 2026-04-25 — the 647-warning baseline has been
 * fully triaged (real leaks fixed; cross-entity-by-design call sites
 * annotated with `// eslint-disable-next-line vip-tenant/require-entity-filter
 * -- <reason>`). Any new query that touches a `strict_entity` /
 * `strict_entity_and_bdm` model without a literal `entity_id` filter will
 * now fail this lint pass — wire it as a CI gate to keep the baseline at
 * zero. Runtime entityGuard (Day-4) remains the dynamic safety net for
 * anything the static rule can't trace through.
 *
 * To regress severity to `warn` for an emergency triage cycle, the
 * `npm run lint:entity-filter` script overrides via `--rule` at the CLI.
 */

const requireEntityFilter = require('./eslint-rules/require-entity-filter');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/tests/**',
      '**/eslint-rules/**',
      '**/logs/**',
      '**/uploads/**',
      '**/coverage/**',
    ],
  },
  {
    files: ['**/*.js'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
      },
    },
    plugins: {
      'vip-tenant': {
        rules: {
          'require-entity-filter': requireEntityFilter,
        },
      },
    },
    rules: {
      'vip-tenant/require-entity-filter': 'error',
    },
  },
];
