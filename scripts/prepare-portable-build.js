'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const nativeProject = path.join(rootDir, 'native', 'InputBlocker', 'InputBlocker.csproj');
const builtInputBlocker = path.join(rootDir, 'native', 'InputBlocker', 'bin', 'Release', 'net48', 'InputBlocker.exe');
const resourcesDir = path.join(rootDir, 'resources');
const packagedInputBlocker = path.join(resourcesDir, 'InputBlocker.exe');
const staleArchive = path.join(rootDir, 'dist', `opslynk-${packageJson.version}-x64.nsis.7z`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function fileNeedsRefresh(source, target) {
  if (!fs.existsSync(source)) return true;
  if (!fs.existsSync(target)) return true;
  return fs.statSync(source).mtimeMs > fs.statSync(target).mtimeMs;
}

if (fileNeedsRefresh(nativeProject, builtInputBlocker)) {
  run('dotnet', ['build', nativeProject, '-c', 'Release']);
}

fs.mkdirSync(resourcesDir, { recursive: true });
fs.copyFileSync(builtInputBlocker, packagedInputBlocker);

if (fs.existsSync(staleArchive)) {
  try {
    fs.unlinkSync(staleArchive);
  } catch (error) {
    console.warn(`[prepare:portable] Could not delete stale archive: ${staleArchive}`);
    console.warn(`[prepare:portable] ${error.message}`);
  }
}
