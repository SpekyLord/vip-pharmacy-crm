/**
 * Backend ESLint flat config — Day-5 of Week-1 Stabilization (2026-04-25).
 *
 * Scope is intentionally narrow: ONLY the custom `require-entity-filter` rule.
 * No other style rules; no inheritance from the frontend config. The intent
 * is to ship the static tenant-leak guard without picking a fight with
 * 100+ controllers' worth of legacy code-style choices.
 *
 * Severity defaults to `warn` so a fresh run produces a violation count
 * without breaking exit code. To take the strict baseline (matches
 * Day-5 §1's "Run on full codebase" step), override at the CLI:
 *
 *   npx eslint --config backend/eslint.config.js \
 *     --rule '{"vip-tenant/require-entity-filter":"error"}' backend/
 *
 * To wire CI as a blocker (post-triage, see docs/ENTITY_SCOPED_MODELS.md):
 * flip the severity in this file to "error" instead of relying on the
 * --rule override.
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
      'vip-tenant/require-entity-filter': 'warn',
    },
  },
];
