const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// RNGH's package.json "react-native" field points at TypeScript sources; Metro can fail
// to resolve sibling modules (e.g. init.ts → ./utils). Use the prebuilt CommonJS bundle.
const rngMain = require.resolve('react-native-gesture-handler/lib/commonjs/index.js');
const { resolveRequest } = config.resolver;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-gesture-handler') {
    return { filePath: rngMain, type: 'sourceFile' };
  }
  if (resolveRequest) {
    return resolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
