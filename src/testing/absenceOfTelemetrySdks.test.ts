// Audit test (SMOKE, not PBT) that verifies the project's dependency tree
// does not incorporate any known usage-analytics, telemetry or tracking SDK.
// See .kiro/specs/asistente-ia-local/design.md (section "Testing Strategy":
// "Auditoría única de ausencia de SDKs de telemetría (6.4, SMOKE)") and
// Requirement 6.4.
//
// Requirement 6.4: the System SHALL NOT incorporate usage-analytics,
// telemetry or tracking services that transmit user information or their
// Conversations to external servers.
//
// Strategy: instead of trying to enumerate at runtime what each dependency
// does, the dependency tree is statically audited (`package.json` for direct
// dependencies and `package-lock.json` for the full tree, including
// transitive ones) against a list of known analytics/telemetry/tracking
// package names. This is fast, deterministic and does not require running a
// full build on every test run.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageLockJson {
  packages?: Record<string, unknown>;
}

const projectRoot = resolve(__dirname, "..", "..");

function readPackageJson(): PackageJson {
  const content = readFileSync(resolve(projectRoot, "package.json"), "utf-8");
  return JSON.parse(content) as PackageJson;
}

function readPackageLockJson(): PackageLockJson {
  const content = readFileSync(resolve(projectRoot, "package-lock.json"), "utf-8");
  return JSON.parse(content) as PackageLockJson;
}

/**
 * Exact (lowercase) names of known npm packages that implement
 * usage-analytics, telemetry or tracking services. Compared by exact package
 * name equality (not by substring) to avoid false positives with unrelated
 * packages whose name contains a similar substring (e.g. `has-tostringtag`
 * "contains" the substring "gtag", but is entirely unrelated to Google
 * Analytics/gtag.js).
 */
const EXACT_TELEMETRY_NAMES = new Set([
  "google-analytics",
  "universal-analytics",
  "react-ga",
  "react-ga4",
  "gtag",
  "ga-gtag",
  "analytics-node",
  "amplitude-js",
  "mixpanel",
  "mixpanel-browser",
  "posthog-js",
  "posthog-node",
  "hotjar",
  "fullstory",
  "newrelic",
  "new-relic-browser",
  "plausible-tracker",
  "matomo-tracker",
  "clarity-js",
  "fbevents",
  "facebook-pixel",
  "tiktok-pixel",
  "intercom-client",
  "logrocket",
  "bugsnag",
  "rollbar",
]);

/**
 * Known npm scope prefixes (lowercase) that publish usage-analytics,
 * telemetry or tracking SDKs under multiple subpackages.
 */
const TELEMETRY_SCOPE_PREFIXES = [
  "@segment/",
  "@amplitude/",
  "@sentry/",
  "@datadog/",
  "@bugsnag/",
  "@microsoft/clarity",
  "@intercom/",
];

/**
 * Extracts the "base" package name from a `package-lock.json` path such as
 * `node_modules/@scope/package/node_modules/other`, returning the final
 * segment (`@scope/package` or `other`).
 */
function packageNameFromLockPath(packagePath: string): string {
  const segments = packagePath.split("node_modules/").filter(Boolean);
  return segments[segments.length - 1] ?? packagePath;
}

function isTelemetryName(lowercaseName: string): boolean {
  return (
    EXACT_TELEMETRY_NAMES.has(lowercaseName) ||
    TELEMETRY_SCOPE_PREFIXES.some((prefix) => lowercaseName.startsWith(prefix))
  );
}

function namesMatchingTelemetry(packageNames: readonly string[]): string[] {
  return packageNames.filter((name) => isTelemetryName(name.toLowerCase()));
}

describe("Absence of telemetry SDKs audit (Requirement 6.4)", () => {
  it("no direct or dev dependency in package.json is a known analytics/telemetry/tracking SDK", () => {
    const packageJson = readPackageJson();

    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];

    expect(dependencyNames.length).toBeGreaterThan(0);

    const matches = namesMatchingTelemetry(dependencyNames);
    expect(matches).toEqual([]);
  });

  it("no package in the full dependency tree (including transitive) in package-lock.json is a known analytics/telemetry/tracking SDK", () => {
    const packageLock = readPackageLockJson();
    const packagePaths = Object.keys(packageLock.packages ?? {}).filter(
      (path) => path !== "" && path.includes("node_modules/"),
    );

    expect(packagePaths.length).toBeGreaterThan(0);

    const packageNames = packagePaths.map(packageNameFromLockPath);
    const matches = namesMatchingTelemetry(packageNames);
    expect(matches).toEqual([]);
  });
});
