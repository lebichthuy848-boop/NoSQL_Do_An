import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function sourceFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) output.push(path);
  }
  return output;
}

export async function build() {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const files = [...await sourceFiles(join(root, "src")), ...await sourceFiles(join(root, "tests"))];
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
      return { status: "FAIL", file };
    }
  }
  return { status: "PASS", nodeVersion: process.versions.node, checkedFiles: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "PASS") process.exitCode = 1;
  }).catch(() => {
    process.stderr.write("Backend build check failed.\n");
    process.exitCode = 1;
  });
}
