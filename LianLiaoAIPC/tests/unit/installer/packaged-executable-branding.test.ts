import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const buildScript = readFileSync('scripts/build-with-builder.js', 'utf8');
const packagedLaunchScript = readFileSync('scripts/packaged-launch.mjs', 'utf8');
const e2eFixtures = readFileSync('tests/e2e/fixtures.ts', 'utf8');
const x64NsisScript = readFileSync('resources/windows-installer-x64.nsh', 'utf8');
const arm64NsisScript = readFileSync('resources/windows-installer-arm64.nsh', 'utf8');

describe('packaged executable branding', () => {
  it.each([
    ['x64', x64NsisScript],
    ['arm64', arm64NsisScript],
  ])('uses the electron-builder executable macro in the %s installer', (_arch, nsisScript) => {
    expect(nsisScript).not.toContain('!define AIONUI_APP_EXECUTABLE_FILENAME');
    expect(nsisScript).not.toContain('${AIONUI_APP_EXECUTABLE_FILENAME}');
    expect(nsisScript).toContain("Join-Path $$instDir '${APP_EXECUTABLE_FILENAME}'");
    expect(nsisScript).toContain("$$_.Name -ieq '${APP_EXECUTABLE_FILENAME}'");
  });

  it.each([
    ['x64', x64NsisScript],
    ['arm64', arm64NsisScript],
  ])('uses the builder product name in user-facing %s installer messages', (_arch, nsisScript) => {
    expect(nsisScript).not.toContain('AionUi cannot update');
    expect(nsisScript).not.toContain('This AionUi installer');
    expect(nsisScript).toContain('${PRODUCT_NAME} cannot update');
    expect(nsisScript).toContain('This ${PRODUCT_NAME} installer');
  });

  it('validates the branded ARM64 executable and uses the product macro in recovery guidance', () => {
    expect(arm64NsisScript).toContain(
      '!insertmacro AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "${APP_EXECUTABLE_FILENAME}"'
    );
    expect(arm64NsisScript).not.toContain('AionUi installation is incomplete');
    expect(arm64NsisScript).not.toContain('Please reinstall AionUi');
    expect(arm64NsisScript).toContain('${PRODUCT_NAME} installation is incomplete');
    expect(arm64NsisScript).toContain('Please reinstall ${PRODUCT_NAME}');
  });

  it('derives Windows build process handling and output detection from package executableName', () => {
    const legacyReferences = buildScript.split(/\r?\n/).filter((line) => line.includes("'AionUi.exe'"));

    expect(buildScript).toContain('const productName = packageJson.productName || packageJson.name;');
    expect(buildScript).toContain('const executableName = packageJson.executableName || productName;');
    expect(buildScript).toContain('const windowsExecutableName = `${executableName}.exe`;');
    expect(buildScript).toContain('isProcessRunningWindows(windowsExecutableName)');
    expect(buildScript).toContain("path.join(outDir, 'win-unpacked', windowsExecutableName)");
    expect(legacyReferences).toHaveLength(1);
    expect(legacyReferences[0]).toContain('legacyWindowsExecutableName');
  });

  it('discovers and cleans packaged executables using package executableName', () => {
    const legacyReferences = packagedLaunchScript.split(/\r?\n/).filter((line) => line.includes("'AionUi.exe'"));

    expect(packagedLaunchScript).toContain("readFileSync(path.join(projectRoot, 'package.json'), 'utf8')");
    expect(packagedLaunchScript).toContain('packageJson.productName || packageJson.name');
    expect(packagedLaunchScript).toContain('packageJson.executableName || productName');
    expect(packagedLaunchScript).toContain('`${executableName}.exe`');
    expect(packagedLaunchScript).toContain("'Contents', 'MacOS', executableName");
    expect(packagedLaunchScript).toMatch(/for \(const name of \[\s*executableName/);
    expect(packagedLaunchScript).toContain('await killProcessByName(`${executableName}.exe`);');
    expect(packagedLaunchScript).toContain('await killProcessByName(executableName);');
    expect(legacyReferences).toHaveLength(1);
    expect(legacyReferences[0]).toContain('LEGACY_WINDOWS_EXECUTABLE_NAME');
  });

  it('discovers E2E packaged executables using the root package productName', () => {
    expect(e2eFixtures).toContain("readFileSync(path.join(projectRoot, 'package.json'), 'utf8')");
    expect(e2eFixtures).toContain('rootPackage.productName || rootPackage.name');
    expect(e2eFixtures).toContain('`${productName}.exe`');
    expect(e2eFixtures).toContain("'Contents', 'MacOS', productName");
    expect(e2eFixtures).toMatch(/for \(const name of \[\s*productName/);
  });
});
