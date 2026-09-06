import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const projectRoot = process.cwd();
const sourceRoots = ['src', join('native', 'src'), join('native', 'src-tauri', 'src')];
const sourceExtensions = new Set(['.ts', '.tsx', '.rs']);

const forbiddenRules = [
  { id: 'fake-record-label', pattern: /\b(?:mock|fake|sample)\s+(?:data|guild|track|queue|playlist|progress|thumbnail|provider)\b/i },
  { id: 'legacy-demo-track', pattern: /Đom\s+Đóm|\bJACK\b/i },
  { id: 'hardcoded-demo-status', pattern: /Mock data|UI demo|demo playback|fake playback/i },
];

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(path));
    else if (sourceExtensions.has(extname(entry.name))
      && !entry.name.endsWith('.test.ts')
      && !entry.name.endsWith('.spec.ts')) files.push(path);
  }
  return files;
}

const findings = [];
for (const root of sourceRoots) {
  const absoluteRoot = join(projectRoot, root);
  for (const file of await listSourceFiles(absoluteRoot)) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of forbiddenRules) {
        if (rule.pattern.test(line)) {
          // Keep gate output secret-safe: location and rule only, never source text.
          // The documented `demo-guild` storage migration compatibility path is not a rule.
          findings.push(`${relative(projectRoot, file)}:${index + 1}:${rule.id}`);
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error('audit:static failed');
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'passed', roots: sourceRoots, filesChecked: 'production-source-only' }));
}
