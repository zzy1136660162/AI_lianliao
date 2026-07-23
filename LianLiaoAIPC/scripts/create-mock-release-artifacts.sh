#!/usr/bin/env bash

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"

rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR/windows-build-x64"
mkdir -p "$ARTIFACTS_DIR/windows-build-arm64"
mkdir -p "$ARTIFACTS_DIR/macos-build-x64"
mkdir -p "$ARTIFACTS_DIR/macos-build-arm64"
mkdir -p "$ARTIFACTS_DIR/linux-build-x64"
mkdir -p "$ARTIFACTS_DIR/linux-build-arm64"

write_mock_artifact() {
  local artifact_path="$1"
  local content="$2"
  printf '%s' "$content" > "$artifact_path"
}

WIN_X64_ARTIFACT="$ARTIFACTS_DIR/windows-build-x64/LianLiaoAIPC-1.0.0-win-x64.exe"
WIN_ARM64_ARTIFACT="$ARTIFACTS_DIR/windows-build-arm64/LianLiaoAIPC-1.0.0-win-arm64.exe"
MAC_X64_DMG="$ARTIFACTS_DIR/macos-build-x64/LianLiaoAIPC-1.0.0-mac-x64.dmg"
MAC_X64_ZIP="$ARTIFACTS_DIR/macos-build-x64/LianLiaoAIPC-1.0.0-mac-x64.zip"
MAC_ARM64_DMG="$ARTIFACTS_DIR/macos-build-arm64/LianLiaoAIPC-1.0.0-mac-arm64.dmg"
MAC_ARM64_ZIP="$ARTIFACTS_DIR/macos-build-arm64/LianLiaoAIPC-1.0.0-mac-arm64.zip"
LINUX_X64_ARTIFACT="$ARTIFACTS_DIR/linux-build-x64/LianLiaoAIPC-1.0.0.deb"
LINUX_ARM64_ARTIFACT="$ARTIFACTS_DIR/linux-build-arm64/LianLiaoAIPC-1.0.0-arm64.deb"

write_mock_artifact "$WIN_X64_ARTIFACT" 'mock-windows-x64-installer'
write_mock_artifact "$WIN_ARM64_ARTIFACT" 'mock-windows-arm64-installer'
write_mock_artifact "$MAC_X64_DMG" 'mock-macos-x64-dmg'
write_mock_artifact "$MAC_X64_ZIP" 'mock-macos-x64-zip'
write_mock_artifact "$MAC_ARM64_DMG" 'mock-macos-arm64-dmg'
write_mock_artifact "$MAC_ARM64_ZIP" 'mock-macos-arm64-zip'
write_mock_artifact "$LINUX_X64_ARTIFACT" 'mock-linux-x64-deb'
write_mock_artifact "$LINUX_ARM64_ARTIFACT" 'mock-linux-arm64-deb'

UPDATER_ARTIFACTS=(
  "$WIN_X64_ARTIFACT"
  "$WIN_ARM64_ARTIFACT"
  "$MAC_X64_ZIP"
  "$MAC_ARM64_ZIP"
  "$LINUX_X64_ARTIFACT"
  "$LINUX_ARM64_ARTIFACT"
)
ARTIFACT_SHA512=()
ARTIFACT_SIZE=()
while IFS=$'\t' read -r sha512 size; do
  ARTIFACT_SHA512+=("$sha512")
  ARTIFACT_SIZE+=("$size")
done < <(node - "${UPDATER_ARTIFACTS[@]}" <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');

for (const artifactPath of process.argv.slice(2)) {
  const sha512 = createHash('sha512').update(readFileSync(artifactPath)).digest('base64');
  process.stdout.write(`${sha512}\t${statSync(artifactPath).size}\n`);
}
NODE
)

if [ "${#ARTIFACT_SHA512[@]}" -ne "${#UPDATER_ARTIFACTS[@]}" ]; then
  echo "Failed to calculate mock artifact metadata" >&2
  exit 1
fi

# Windows x64
cat > "$ARTIFACTS_DIR/windows-build-x64/latest.yml" <<EOF
version: 1.0.0
files:
  - url: AionUi-Setup-1.0.0.exe
    sha512: ${ARTIFACT_SHA512[0]}
    size: ${ARTIFACT_SIZE[0]}
path: AionUi-Setup-1.0.0.exe
sha512: ${ARTIFACT_SHA512[0]}
releaseDate: '2025-01-01'
EOF

# Windows arm64
cat > "$ARTIFACTS_DIR/windows-build-arm64/latest.yml" <<EOF
version: 1.0.0
files:
  - url: AionUi-Setup-1.0.0-arm64.exe
    sha512: ${ARTIFACT_SHA512[1]}
    size: ${ARTIFACT_SIZE[1]}
path: AionUi-Setup-1.0.0-arm64.exe
sha512: ${ARTIFACT_SHA512[1]}
releaseDate: '2025-01-01'
EOF

# macOS x64
cat > "$ARTIFACTS_DIR/macos-build-x64/latest-mac.yml" <<EOF
version: 1.0.0
files:
  - url: AionUi-1.0.0-mac.zip
    sha512: ${ARTIFACT_SHA512[2]}
    size: ${ARTIFACT_SIZE[2]}
path: AionUi-1.0.0-mac.zip
sha512: ${ARTIFACT_SHA512[2]}
EOF

# macOS arm64
cat > "$ARTIFACTS_DIR/macos-build-arm64/latest-mac.yml" <<EOF
version: 1.0.0
files:
  - url: AionUi-1.0.0-arm64-mac.zip
    sha512: ${ARTIFACT_SHA512[3]}
    size: ${ARTIFACT_SIZE[3]}
path: AionUi-1.0.0-arm64-mac.zip
sha512: ${ARTIFACT_SHA512[3]}
EOF

# Linux x64
cat > "$ARTIFACTS_DIR/linux-build-x64/latest-linux.yml" <<EOF
version: 1.0.0
files:
  - url: AionUi-1.0.0-amd64.deb
    sha512: ${ARTIFACT_SHA512[4]}
    size: ${ARTIFACT_SIZE[4]}
EOF

# Linux arm64
cat > "$ARTIFACTS_DIR/linux-build-arm64/latest-linux-arm64.yml" <<EOF
version: 1.0.0
files:
  - url: AionUi-1.0.0-arm64.deb
    sha512: ${ARTIFACT_SHA512[5]}
    size: ${ARTIFACT_SIZE[5]}
EOF

# Web-CLI tarballs (5 platforms)
WEB_PLATFORMS=(
  "darwin-arm64"
  "darwin-x86_64"
  "linux-arm64"
  "linux-x86_64"
  "win-x86_64"
)

for plat in "${WEB_PLATFORMS[@]}"; do
  dir="$ARTIFACTS_DIR/web-cli-${plat}"
  mkdir -p "$dir"
  tarball="aionui-web-1.0.0-${plat}.tar.gz"
  touch "$dir/$tarball"
  # Produce a deterministic fake SHA256 file in the expected format:
  # "<64 hex chars>  <filename>"
  echo "0000000000000000000000000000000000000000000000000000000000000000  ${tarball}" > "$dir/${tarball}.sha256"
done

# install-web.sh (version-substituted placeholder)
mkdir -p "$ARTIFACTS_DIR/install-web-script"
cat > "$ARTIFACTS_DIR/install-web-script/install-web.sh" <<'EOF'
#!/usr/bin/env bash
# Mock install-web.sh for release-script-test
set -euo pipefail
echo "mock install-web.sh"
EOF
chmod +x "$ARTIFACTS_DIR/install-web-script/install-web.sh"

echo "Mock artifacts created in $ARTIFACTS_DIR:"
find "$ARTIFACTS_DIR" -type f | sort
