/**
 * Unit-test configuration.
 *
 * `jest-expo` is Expo's own preset and is pinned to the SDK: the `sdk-55` dist
 * tag resolves to jest-expo@55.x, which matches expo@55 / react-native@0.83 /
 * react@19.2 already in package.json. It derives its transform from
 * `react-native/jest-preset` and picks up `expo/internal/babel-preset`
 * automatically, so no separate babel.config.js is required.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.ts?(x)", "**/*.test.ts?(x)"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/android/",
    "/ios/",
    "/.expo/",
    "/dist/",
  ],
  modulePathIgnorePatterns: ["/android/", "/ios/", "/.expo/", "/dist/"],
  clearMocks: true,
  restoreMocks: true,
};
