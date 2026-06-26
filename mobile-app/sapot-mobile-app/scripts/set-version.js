import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { isValidVersion, bumpPackageJson, syncAppConfig } from "./version-sync.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!isValidVersion(version)) {
  console.error(`Invalid version "${version}". Expected X.Y.Z or X.Y.Z-(alpha|beta|rc).N`);
  process.exit(1);
}

const pkgPath = join(root, "package.json");
const cfgPath = join(root, "app.config.ts");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
writeFileSync(pkgPath, JSON.stringify(bumpPackageJson(pkg, version), null, 2) + "\n");

const cfg = readFileSync(cfgPath, "utf8");
writeFileSync(cfgPath, syncAppConfig(cfg, version));

console.log(`Mobile version set to ${version}`);
