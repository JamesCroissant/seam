#!/usr/bin/env node
// npm create seam@latest [dir]      (also: pnpm create seam, yarn create seam, bun create seam)
//
// Options:
//   --seam <spec>   version/spec of the seam package to depend on (default: the published version)
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEAM_VERSION = "^0.1.0";
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};

const seamSpec = flag("--seam") ?? SEAM_VERSION;
const target = resolve(args[0] ?? "seam-app");
const name = basename(target).toLowerCase().replace(/[^a-z0-9-._~]/g, "-");

if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`✗ ${relative(process.cwd(), target) || "."} is not empty. Choose a new folder.`);
  process.exit(1);
}

const template = fileURLToPath(new URL("./template", import.meta.url));
cpSync(template, target, { recursive: true });
// npm drops .gitignore files from published packages, so the template ships it as _gitignore.
renameSync(join(target, "_gitignore"), join(target, ".gitignore"));
for (const file of ["package.json", "README.md"]) {
  const path = join(target, file);
  writeFileSync(path, readFileSync(path, "utf8").replaceAll("{{name}}", name).replaceAll("{{seam}}", seamSpec));
}

const pm = (process.env.npm_config_user_agent ?? "npm").split("/")[0];
const run = pm === "npm" ? "npm run" : pm;
const dir = relative(process.cwd(), target) || ".";
console.log(`
✓ Created ${name} in ${dir}

Next:
  cd ${dir}
  ${pm} install
  ${run} dev

Requires Node.js 22.12 or later.
`);
