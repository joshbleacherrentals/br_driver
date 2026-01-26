// Metro config for Expo.
//
// Fixes Hermes bundling failures caused by ESM-only syntax pulled in via
// package "exports" resolution (notably Kysely's ESM migration provider which
// contains `import(/* webpackIgnore: true */ ...)`).
//
// We disable package-exports resolution so Metro prefers `main` (CJS) entrypoints.

const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Prefer classic `main` resolution over `exports` conditions.
// This avoids bundling ESM entrypoints that Hermes can't parse.
config.resolver.unstable_enablePackageExports = false;

// Keep the default main fields but ensure `main` is included.
config.resolver.resolverMainFields = ["react-native", "browser", "main"];

module.exports = config;
