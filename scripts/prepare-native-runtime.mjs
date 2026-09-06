import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(import.meta.dirname, '..');
const runtimeDir = path.join(rootDir, 'native', 'src-tauri', 'resources', 'runtime');
const distDir = path.join(rootDir, 'dist');
const rootPackagePath = path.join(rootDir, 'package.json');
const rootLockPath = path.join(rootDir, 'package-lock.json');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const releaseRuntimeDir = path.join(rootDir, 'native', 'src-tauri', 'target', 'release', 'runtime');
const testSpecFilePattern = /(^|[._-])(test|tests|spec)([._-]|$)/i;

async function assertFile(filePath, message) {
  try {
    await readFile(filePath);
  } catch {
    throw new Error(message);
  }
}

async function copyProductionDist(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyProductionDist(sourcePath, targetPath);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith('.map') || entry.name.endsWith('.test.js')) continue;
    await copyFile(sourcePath, targetPath);
  }
}

async function removeSourceMaps(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeSourceMaps(filePath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.map')) await rm(filePath, { force: true });
  }
}

async function removeProductionTestFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeProductionTestFiles(filePath);
      continue;
    }
    // Production Node never loads package tests, specs, or declaration-only
    // fixtures. Remove the complete test/spec filename family, not just
    // `*.test.js`, so the bundle cannot retain executable specs or type-only
    // test declarations from transitive dependencies.
    if (entry.isFile() && testSpecFilePattern.test(entry.name)) {
      await rm(filePath, { force: true });
    }
  }
}

async function findFiles(directory, predicate, matches = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await findFiles(filePath, predicate, matches);
      continue;
    }
    if (entry.isFile() && predicate(entry.name)) matches.push(filePath);
  }
  return matches;
}

await assertFile(
  path.join(distDir, 'index.js'),
  'Không tìm thấy dist/index.js. Hãy chạy npm run build trước khi chuẩn bị native runtime.'
);
await assertFile(
  rootLockPath,
  'Không tìm thấy package-lock.json; production runtime cần lockfile để cài dependency tái lập được.'
);
await assertFile(
  process.execPath,
  'Không tìm thấy Node executable dùng để đóng gói native runtime.'
);

// Tauri copies resources into target/release without removing files that were
// present in an older build. Clear only this generated staging directory so a
// release can never retain stale source maps or removed production modules.
await rm(releaseRuntimeDir, { recursive: true, force: true });
await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });
await copyProductionDist(distDir, path.join(runtimeDir, 'dist'));
await cp(process.execPath, path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node'));

const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'));
const runtimePackage = {
  name: 'localbot-native-runtime',
  version: rootPackage.version,
  private: true,
  type: 'module',
  engines: rootPackage.engines,
  dependencies: rootPackage.dependencies
};
await writeFile(path.join(runtimeDir, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8');
await cp(rootLockPath, path.join(runtimeDir, 'package-lock.json'));

const npmArgs = [
  'ci',
  '--omit=dev',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--prefix',
  runtimeDir
];
if (process.platform === 'win32') {
  // Node 24 rejects direct execFile calls for Windows .cmd shims. Passing the
  // command through cmd.exe keeps argument boundaries intact without enabling
  // a shell string assembled from user input.
  await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...npmArgs], {
    cwd: rootDir,
    maxBuffer: 8 * 1024 * 1024
  });
} else {
  await execFileAsync('npm', npmArgs, { cwd: rootDir, maxBuffer: 8 * 1024 * 1024 });
}

// ffmpeg-static downloads the platform binary through its install hook. The
// production install intentionally skips hooks, so copy the already installed
// Windows binary explicitly without copying the whole development tree.
const ffmpegSource = path.join(nodeModulesDir, 'ffmpeg-static');
const ffmpegTarget = path.join(runtimeDir, 'node_modules', 'ffmpeg-static');
await assertFile(
  path.join(ffmpegSource, 'ffmpeg.exe'),
  'Không tìm thấy ffmpeg-static/ffmpeg.exe trong node_modules hiện tại.'
);
await cp(ffmpegSource, ffmpegTarget, { recursive: true, force: true });
await removeSourceMaps(runtimeDir);
await removeProductionTestFiles(runtimeDir);

const residualSourceMaps = await findFiles(runtimeDir, (name) => name.endsWith('.map'));
const residualTestSpecs = await findFiles(runtimeDir, (name) => testSpecFilePattern.test(name));
if (residualSourceMaps.length > 0 || residualTestSpecs.length > 0) {
  throw new Error(`Native runtime cleanup failed: ${residualSourceMaps.length} source maps and ${residualTestSpecs.length} test/spec files remain.`);
}

await writeFile(
  path.join(runtimeDir, 'runtime-manifest.json'),
  `${JSON.stringify({
    product: 'LocalBot',
    runtime: 'native-owned-node',
    nodeVersion: process.version,
    sourceBuild: 'root/dist',
    sourceMapsIncluded: false,
    testArtifactsIncluded: false,
    generatedAt: new Date().toISOString()
  }, null, 2)}\n`,
  'utf8'
);

console.log(`Prepared native runtime at ${runtimeDir}`);
