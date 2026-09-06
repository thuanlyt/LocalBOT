import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(projectRoot, "native", "src-tauri", "resources", "runtime");
const releaseBundleRoot = path.join(projectRoot, "native", "src-tauri", "target", "release", "bundle");
const nativeDistRoot = path.join(projectRoot, "native", "dist");
const testSpecFilePattern = /(^|[._-])(test|tests|spec)([._-]|$)/i;

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(directory) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function fail(message) {
  throw new Error(`Native artifact verification failed: ${message}`);
}

const runtimeFiles = await findFiles(runtimeRoot);
const nodeName = process.platform === "win32" ? "node.exe" : "node";
if (!(await exists(path.join(runtimeRoot, nodeName)))) fail("bundled Node executable is missing");
if (!(await exists(path.join(runtimeRoot, "dist", "index.js")))) fail("compiled runtime entry is missing");

const sourceMaps = runtimeFiles.filter((filePath) => path.extname(filePath).toLowerCase() === ".map");
const testSpecFiles = runtimeFiles.filter((filePath) => testSpecFilePattern.test(path.basename(filePath)));
const envFiles = runtimeFiles.filter((filePath) => path.basename(filePath).toLowerCase().startsWith(".env"));
if (sourceMaps.length > 0) fail(`${sourceMaps.length} source map(s) found in runtime`);
if (testSpecFiles.length > 0) fail(`${testSpecFiles.length} test/spec file(s) found in runtime`);
if (envFiles.length > 0) fail(`${envFiles.length} environment file(s) found in runtime`);

for (const starterAsset of ["tauri.svg", "vite.svg", "react.svg"]) {
  if (await exists(path.join(nativeDistRoot, starterAsset))) fail(`starter asset ${starterAsset} is present in native dist`);
}

const msiFiles = (await findFiles(path.join(releaseBundleRoot, "msi"))).filter((filePath) => path.extname(filePath).toLowerCase() === ".msi");
const nsisFiles = (await findFiles(path.join(releaseBundleRoot, "nsis"))).filter((filePath) => path.extname(filePath).toLowerCase() === ".exe");
if (msiFiles.length === 0) fail("MSI artifact is missing");
if (nsisFiles.length === 0) fail("NSIS artifact is missing");

let runtimeBytes = 0;
for (const filePath of runtimeFiles) runtimeBytes += (await stat(filePath)).size;
process.stdout.write(`${JSON.stringify({
  status: "verified",
  runtimeFiles: runtimeFiles.length,
  runtimeBytes,
  sourceMaps: sourceMaps.length,
  testSpecFiles: testSpecFiles.length,
  envFiles: envFiles.length,
  msiArtifacts: msiFiles.length,
  nsisArtifacts: nsisFiles.length,
})}\n`);
