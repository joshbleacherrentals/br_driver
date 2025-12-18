const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Path to your local legend-state fork
const legendStatePath = '/Users/joshredgrift/Documents/GitHub/legend-state';

// Watch the legend-state folder for changes
config.watchFolders = [legendStatePath];

// Make sure Metro can resolve modules from legend-state
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(legendStatePath, 'node_modules'),
];

// Ensure symlinks are followed
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
