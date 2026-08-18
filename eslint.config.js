// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * §15 driver scoping — the tables that must never be read unscoped.
 *
 * Both sync every authenticated driver's rows to every device (their Postgres
 * RLS is `get_current_driver_id() IS NOT NULL`, not owner-scoped), so a bare
 * `db.selectFrom(...)` on either returns whoever's rows happen to match. The
 * only legitimate entry points are the scoped sources in
 * `library/powersync/scoping/scopedFrom.ts`.
 *
 * The type system already makes it hard to scope by the *wrong* driver (a
 * `DriverScope` can only be minted by `publishDriverScope`); this is what makes
 * it hard to skip scoping altogether, which is the mistake that actually
 * happened four times.
 */
const DRIVER_SCOPED_TABLES = ['DamageReportPhotos', 'InspectionPhotos'];

const noUnscopedPhotoTableReads = DRIVER_SCOPED_TABLES.map((table) => ({
  selector: `CallExpression[callee.property.name='selectFrom'] > Literal[value='${table}']`,
  message:
    `Do not open an unscoped query on ${table} (§15 — it syncs every driver's ` +
    `rows to every device). Use the scoped source from ` +
    `@/library/powersync/scoping instead, or add one there if none fits.`,
}));

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    // The scoping module *is* the sanctioned entry point, and tests build
    // deliberately-unscoped queries to prove the scoped ones differ from them.
    ignores: ['library/powersync/scoping/**', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': ['error', ...noUnscopedPhotoTableReads],
    },
  },
]);
