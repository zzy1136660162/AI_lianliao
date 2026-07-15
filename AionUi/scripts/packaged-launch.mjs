#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const LEGACY_WINDOWS_EXECUTABLE_NAME = 'AionUi.exe';
const LEGACY_EXECUTABLE_NAME = 'AionUi';
const LEGACY_LINUX_EXECUTABLE_NAME = 'aionui';

function parseArgs(argv) {
  const flags = new Set(argv.filter((x) => x.startsWith('--')));
  const values = argv.filter((x) => !x.startsWith('--'));
  return { flags, values };
}

function isWindows() {
  return process.platform === 'win32';
}

function killProcessByName(name) {
  return new Promise((resolve) => {
    const args = isWindows() ? ['/F', '/IM', name] : ['-f', name];
    const cmd = isWindows() ? 'taskkill' : 'pkill';
    const child = spawn(cmd, args, { stdio: 'ignore', shell: false });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

function readProductName(projectRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  return packageJson.productName || packageJson.name;
}

function resolvePackagedApp(projectRoot, productName) {
  const outDir = path.join(projectRoot, 'out');
  if (!fs.existsSync(outDir)) return null;

  if (process.platform === 'win32') {
    for (const dir of ['win-unpacked', 'win-x64-unpacked', 'win-arm64-unpacked']) {
      for (const name of [`${productName}.exe`, LEGACY_WINDOWS_EXECUTABLE_NAME]) {
        const exe = path.join(outDir, dir, name);
        if (fs.existsSync(exe)) return { executablePath: exe, cwd: path.join(outDir, dir) };
      }
    }
  } else if (process.platform === 'darwin') {
    for (const dir of ['mac-arm64', 'mac-x64', 'mac', 'mac-universal']) {
      const macDir = path.join(outDir, dir);
      if (!fs.existsSync(macDir)) continue;
      const appBundle = fs.readdirSync(macDir).find((f) => f.endsWith('.app'));
      if (!appBundle) continue;
      const brandedExecutable = path.join(macDir, appBundle, 'Contents', 'MacOS', productName);
      if (fs.existsSync(brandedExecutable)) {
        return { executablePath: brandedExecutable, cwd: macDir };
      }
      if (productName !== LEGACY_EXECUTABLE_NAME) {
        const legacyExecutable = path.join(macDir, appBundle, 'Contents', 'MacOS', LEGACY_EXECUTABLE_NAME);
        if (fs.existsSync(legacyExecutable)) {
          return { executablePath: legacyExecutable, cwd: macDir };
        }
      }
    }
  } else {
    for (const dir of ['linux-unpacked', 'linux-x64-unpacked', 'linux-arm64-unpacked']) {
      const dirPath = path.join(outDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      for (const name of [
        productName,
        productName.toLowerCase(),
        LEGACY_LINUX_EXECUTABLE_NAME,
        LEGACY_EXECUTABLE_NAME,
      ]) {
        const exe = path.join(dirPath, name);
        if (fs.existsSync(exe)) return { executablePath: exe, cwd: dirPath };
      }
    }
  }

  return null;
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const productName = readProductName(projectRoot);
  const dryRun = flags.has('--dry-run');
  const shouldClean = !flags.has('--no-clean');
  const passthroughArgs = values;

  const packaged = resolvePackagedApp(projectRoot, productName);
  if (!packaged) {
    console.error('[packaged-launch] No unpacked app found under out/. Run `just build-package` first.');
    process.exit(1);
  }

  if (shouldClean) {
    await killProcessByName(`${productName}.exe`);
    await killProcessByName(productName);
    if (`${productName}.exe` !== LEGACY_WINDOWS_EXECUTABLE_NAME) {
      await killProcessByName(LEGACY_WINDOWS_EXECUTABLE_NAME);
    }
    if (productName !== LEGACY_EXECUTABLE_NAME) {
      await killProcessByName(LEGACY_EXECUTABLE_NAME);
    }
    await killProcessByName('electron.exe');
    await killProcessByName('electron');
  }

  const env = {
    ...process.env,
    AIONUI_EXTENSIONS_PATH: path.join(projectRoot, 'examples'),
  };

  console.log(`[packaged-launch] executable: ${packaged.executablePath}`);
  console.log(`[packaged-launch] cwd: ${packaged.cwd}`);
  console.log(`[packaged-launch] AIONUI_EXTENSIONS_PATH: ${env.AIONUI_EXTENSIONS_PATH}`);

  if (dryRun) return;

  const child = spawn(packaged.executablePath, passthroughArgs, {
    cwd: packaged.cwd,
    env,
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[packaged-launch] Failed:', error);
  process.exit(1);
});
