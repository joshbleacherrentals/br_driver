import { compareSemver } from "./compareSemver";

/**
 * Paths that force a new native binary.
 *
 * MUST stay in step with the `Detect native changes` grep in
 * `.github/workflows/build-production.yml` — that step decides whether a merge
 * to main becomes an EAS Build or an OTA update, and this check decides whether
 * that build will be accepted by the App Store. If the two lists drift, a build
 * ships without the version guard having run.
 */
const NATIVE_PATHS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^app\.json$/,
  /^app\.config\./,
  /^eas\.json$/,
  /^plugins\//,
  /^patches\//,
];

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export type AppVersionCheckInput = {
  /** `version` from package.json on the PR head. */
  headVersion: string;
  /**
   * `version` from package.json on **main** — always main, never the PR's own
   * target. main is what was last shipped to the App Store, so it is the only
   * number Apple compares against.
   */
  mainVersion: string;
  /** the branch this PR targets: `dev`, `staging` or `main`. */
  targetBranch: string;
  /** every path this PR changed, relative to its target branch. */
  changedFiles: string[];
};

export type AppVersionCheckResult =
  { ok: true; note: string } | { ok: false; reason: string };

/**
 * Catch ITMS-90062 / ITMS-90186 at pull-request time, on the way *in* to dev
 * rather than on the way out to the App Store.
 *
 * `app.config.ts` takes `version` from package.json, which becomes
 * CFBundleShortVersionString. Apple rejects a binary whose value is not higher
 * than the last approved release, and `eas.json` only auto-increments the
 * *build* number, never this one.
 *
 * The bar is the same on every branch: **higher than main**. A feature branch
 * merging into dev while main is still 1.7.0 has to be 1.8.0 or above. Once dev
 * is at 1.8.0, later feature branches at 1.8.0 pass — the bump already happened
 * and only needs to happen once per release.
 *
 * The one exception is a JS-only pull request straight into main. That merge
 * ships as an OTA update, and `app.json` sets `runtimeVersion.policy:
 * "appVersion"` — bumping the version would strand the update, offering it only
 * to binaries that do not exist yet. Production hotfixes have to be able to keep
 * the version they are patching.
 */
export function checkAppVersionBump(
  input: AppVersionCheckInput,
): AppVersionCheckResult {
  const { headVersion, mainVersion, targetBranch, changedFiles } = input;

  if (!VERSION_PATTERN.test(headVersion)) {
    return {
      ok: false,
      reason: `package.json version "${headVersion}" is not major.minor.patch.`,
    };
  }

  if (compareSemver(headVersion, mainVersion) > 0) {
    return {
      ok: true,
      note: `${headVersion} is ahead of main's ${mainVersion}.`,
    };
  }

  const nativeChanges = changedFiles.filter((path) =>
    NATIVE_PATHS.some((pattern) => pattern.test(path)),
  );

  if (targetBranch === "main" && nativeChanges.length === 0) {
    return {
      ok: true,
      note:
        `JS-only pull request into main — ships as an OTA update to ${mainVersion}, ` +
        `so the version has to stay put.`,
    };
  }

  return {
    ok: false,
    reason:
      `package.json version is ${headVersion}, which is not higher than ${mainVersion} on main — ` +
      `the version already approved on the App Store.\n\n` +
      `  Merging this eventually produces a binary Apple rejects with ITMS-90062 ` +
      `(CFBundleShortVersionString must be higher than the previously approved version) and ` +
      `ITMS-90186 (that version train is closed).\n\n` +
      `  Bump "version" in package.json above ${mainVersion}. If ${targetBranch} has already ` +
      `been bumped for this release, rebase onto it and keep that number.`,
  };
}
