#!/usr/bin/env node
// Bumps package.json's patch version and keeps pass-and-play's hand-copied
// version tag (which has no build step to read it from at runtime — see
// pass-and-play/index.html) in sync in the same step. Run via `npm run
// bump`. Prints the new version to stdout so it's visible in whatever ran it.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const passAndPlayPath = path.join(root, "pass-and-play", "index.html");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = nextVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const passAndPlayHtml = readFileSync(passAndPlayPath, "utf-8");
const updatedHtml = passAndPlayHtml.replace(/(<div class="version-tag">v)[\d.]+(<\/div>)/, `$1${nextVersion}$2`);
if (updatedHtml === passAndPlayHtml) {
  console.warn(`warning: could not find the version-tag div in ${passAndPlayPath} to update`);
}
writeFileSync(passAndPlayPath, updatedHtml);

console.log(nextVersion);
