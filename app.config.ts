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
    };
  }

  if (environment === "staging") {
    return {
      name: `${APP_NAME} Staging`,
      iosBundleId: `${IOS_BUNDLE_ID}.staging`,
      androidPackage: `${ANDROID_PACKAGE}.staging`,
      scheme: `${SCHEME}-staging`,
    };
  }

  return {
    name: `${APP_NAME} Dev`,
    iosBundleId: `${IOS_BUNDLE_ID}.dev`,
    androidPackage: `${ANDROID_PACKAGE}.dev`,
    scheme: `${SCHEME}-dev`,
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
    },
    android: {
      ...config.android,
      package: dynamic.androidPackage,
    },
    extra: {
      ...(config.extra ?? {}),
      APP_ENV: appEnv,
    },
  };
};
