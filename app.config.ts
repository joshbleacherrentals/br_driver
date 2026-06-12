import type { ConfigContext, ExpoConfig } from "expo/config";
import { version } from "./package.json";

type AppEnv = "development" | "staging" | "production";

const APP_NAME = "Bleacher Rentals Driver";
// Must match the Expo account/organization that owns the EAS project.
const OWNER = "bleacher-rentals";
const SLUG = "br_driver";

const IOS_BUNDLE_ID = "com.bleacherrentals.driver";
const ANDROID_PACKAGE = "com.bleacherrentals.driver";
const SCHEME = "brdriver";

function getAppEnv(): AppEnv {
  const raw = process.env.APP_ENV;
  if (raw === "production" || raw === "staging" || raw === "development") return raw;
  return "development";
}

function getDynamicIds(environment: AppEnv) {
  if (environment === "production") {
    return {
      name: APP_NAME,
      iosBundleId: IOS_BUNDLE_ID,
      androidPackage: ANDROID_PACKAGE,
      scheme: SCHEME,
      iosIcon: {
        light: "./assets/icons/ios-light.png",
        dark: "./assets/icons/ios-dark.png",
        tinted: "./assets/icons/ios-tinted.png",
      },
      androidAdaptiveIcon: "./assets/icons/adaptive-icon.png",
    };
  }

  if (environment === "staging") {
    return {
      name: `${APP_NAME} Staging`,
      iosBundleId: `${IOS_BUNDLE_ID}.staging`,
      androidPackage: `${ANDROID_PACKAGE}.staging`,
      scheme: `${SCHEME}-staging`,
      iosIcon: {
        light: "./assets/icons/ios-light-staging.png",
        dark: "./assets/icons/ios-dark-staging.png",
        tinted: "./assets/icons/ios-tinted-staging.png",
      },
      androidAdaptiveIcon: "./assets/icons/adaptive-icon-staging.png",
    };
  }

  return {
    name: `${APP_NAME} Dev`,
    iosBundleId: `${IOS_BUNDLE_ID}.dev`,
    androidPackage: `${ANDROID_PACKAGE}.dev`,
    scheme: `${SCHEME}-dev`,
    iosIcon: {
      light: "./assets/icons/ios-light-dev.png",
      dark: "./assets/icons/ios-dark-dev.png",
      tinted: "./assets/icons/ios-tinted-dev.png",
    },
    androidAdaptiveIcon: "./assets/icons/adaptive-icon-dev.png",
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = getAppEnv();
  const dynamic = getDynamicIds(appEnv);

  // `config` is the merged base config (e.g. from app.json).
  // We override only what should vary by environment.
  console.log("⚙️ Building app for APP_ENV:", appEnv);

  return {
    ...config,
    name: dynamic.name,
    owner: OWNER,
    slug: SLUG,
    version,
    scheme: dynamic.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: dynamic.iosBundleId,
      icon: dynamic.iosIcon,
    },
    android: {
      ...config.android,
      package: dynamic.androidPackage,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage: dynamic.androidAdaptiveIcon,
        monochromeImage: dynamic.androidAdaptiveIcon,
      },
    },
    extra: {
      ...(config.extra ?? {}),
      APP_ENV: appEnv,
    },
  };
};
