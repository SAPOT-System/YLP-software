const SEMVER = /^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/;

export function isValidVersion(v) {
  return typeof v === "string" && SEMVER.test(v);
}

export function bumpPackageJson(pkg, version) {
  return { ...pkg, version };
}

export function syncAppConfig(source, version) {
  return source
    .replace(/(\n\s*version:\s*)"[^"]*"/, `$1"${version}"`)
    .replace(/(\n\s*displayVersion:\s*)"[^"]*"/, `$1"${version}"`);
}
