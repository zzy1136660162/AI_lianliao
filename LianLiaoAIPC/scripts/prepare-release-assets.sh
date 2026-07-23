#!/usr/bin/env bash
# prepare-release-assets.sh
#
# Normalize electron-updater metadata from multi-arch build artifacts
# into a deterministic release-assets/ directory.
#
# Usage:
#   ./scripts/prepare-release-assets.sh [ARTIFACTS_DIR] [OUTPUT_DIR]
#
# Defaults:
#   ARTIFACTS_DIR = build-artifacts
#   OUTPUT_DIR    = release-assets

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"
OUTPUT_DIR="${2:-release-assets}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# 1) Copy all distributables (unique file names)
# ---------------------------------------------------------------------------
echo "==> Copying distributables from $ARTIFACTS_DIR ..."
DISTRIBUTABLES=()
while IFS= read -r file; do
  DISTRIBUTABLES+=("$file")
done < <(find "$ARTIFACTS_DIR" -type f \( \
  -name "*.exe" -o \
  -name "*.msi" -o \
  -name "*.dmg" -o \
  -name "*.deb" -o \
  -name "*.zip" \
\) | sort)

DUPLICATE_BASENAMES=$(for file in "${DISTRIBUTABLES[@]}"; do basename "$file"; done | sort | uniq -d || true)
if [ -n "$DUPLICATE_BASENAMES" ]; then
  echo "::error::Found duplicate distributable basenames that would be overwritten in flat output:"
  echo "$DUPLICATE_BASENAMES"
  exit 1
fi

for file in "${DISTRIBUTABLES[@]}"; do
  cp -f "$file" "$OUTPUT_DIR/"
done

# ---------------------------------------------------------------------------
# 1b) Copy web-cli tarballs (+ sha256 checksums)
# ---------------------------------------------------------------------------
echo "==> Copying web-cli tarballs from $ARTIFACTS_DIR ..."
WEB_CLI_FILES=()
while IFS= read -r file; do
  WEB_CLI_FILES+=("$file")
done < <(find "$ARTIFACTS_DIR" -type f \( \
  -name "aionui-web-*.tar.gz" -o \
  -name "aionui-web-*.tar.gz.sha256" \
\) | sort)

WEB_CLI_DUPS=$(for file in "${WEB_CLI_FILES[@]}"; do basename "$file"; done | sort | uniq -d || true)
if [ -n "$WEB_CLI_DUPS" ]; then
  echo "::error::Duplicate web-cli artifact basenames:"
  echo "$WEB_CLI_DUPS"
  exit 1
fi

for file in "${WEB_CLI_FILES[@]}"; do
  cp -f "$file" "$OUTPUT_DIR/"
done

# ---------------------------------------------------------------------------
# 1c) Copy install-web.sh (version-substituted)
# ---------------------------------------------------------------------------
echo "==> Copying install-web.sh ..."
INSTALL_SCRIPT=$(find "$ARTIFACTS_DIR" -type f -name 'install-web.sh' | head -n 1 || true)
if [ -n "$INSTALL_SCRIPT" ]; then
  cp -f "$INSTALL_SCRIPT" "$OUTPUT_DIR/install-web.sh"
  chmod +x "$OUTPUT_DIR/install-web.sh"
fi

# ---------------------------------------------------------------------------
# 2) Collect updater metadata from each platform artifact directory
# ---------------------------------------------------------------------------
echo "==> Collecting updater metadata ..."

WIN_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/windows-build-x64/*" -name "latest.yml" | sort | head -n 1 || true)
WIN_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/windows-build-arm64/*" -name "latest.yml" | sort | head -n 1 || true)
MAC_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/macos-build-x64/*" -name "latest-mac.yml" | sort | head -n 1 || true)
MAC_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/macos-build-arm64/*" -name "latest-mac.yml" | sort | head -n 1 || true)
LINUX_X64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/linux-build-x64/*" -name "latest-linux.yml" | sort | head -n 1 || true)
LINUX_ARM64_LATEST=$(find "$ARTIFACTS_DIR" -type f -path "*/linux-build-arm64/*" -name "latest-linux-arm64.yml" | sort | head -n 1 || true)

# ---------------------------------------------------------------------------
# 3) Publish deterministic canonical metadata for electron-updater
#    (avoid nondeterministic overwrite when multiple jobs produce same names)
# ---------------------------------------------------------------------------
echo "==> Writing canonical updater metadata ..."

[ -n "$WIN_X64_LATEST" ]    && cp -f "$WIN_X64_LATEST"    "$OUTPUT_DIR/latest.yml"
[ -n "$MAC_X64_LATEST" ]    && cp -f "$MAC_X64_LATEST"    "$OUTPUT_DIR/latest-mac.yml"
[ -n "$LINUX_X64_LATEST" ]  && cp -f "$LINUX_X64_LATEST"  "$OUTPUT_DIR/latest-linux.yml"
[ -n "$LINUX_ARM64_LATEST" ] && cp -f "$LINUX_ARM64_LATEST" "$OUTPUT_DIR/latest-linux-arm64.yml"

# ---------------------------------------------------------------------------
# 4) Architecture-specific metadata required by electron-updater
# ---------------------------------------------------------------------------
echo "==> Writing architecture-specific updater metadata ..."

[ -n "$WIN_ARM64_LATEST" ]  && cp -f "$WIN_ARM64_LATEST"  "$OUTPUT_DIR/latest-win-arm64.yml"

# electron-updater on macOS constructs the yml filename as "${channel}-mac.yml".
# For arm64, channel is "latest-arm64", so it looks for "latest-arm64-mac.yml".
[ -n "$MAC_ARM64_LATEST" ]  && cp -f "$MAC_ARM64_LATEST"  "$OUTPUT_DIR/latest-arm64-mac.yml"

# ---------------------------------------------------------------------------
# 4b) Materialize updater-safe aliases referenced by metadata
# ---------------------------------------------------------------------------
echo "==> Materializing updater artifact aliases ..."

MISSING=0

materialize_metadata_aliases() {
  local metadata_file="$1"
  if [ -z "$metadata_file" ]; then
    return
  fi

  if ! node - "$metadata_file" "$OUTPUT_DIR" <<'NODE'
const { createHash } = require('node:crypto');
const { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { basename, dirname, extname, isAbsolute, join } = require('node:path');

const [metadataPath, outputDir] = process.argv.slice(2);

function parseScalar(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.at(-1) === first) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function validateReference(reference) {
  const isSafeAsciiBasename =
    /^[0-9A-Za-z._-]+$/.test(reference) &&
    !reference.includes('..') &&
    basename(reference) === reference &&
    !isAbsolute(reference);
  if (!isSafeAsciiBasename) {
    throw new Error(`Unsafe updater artifact reference in ${metadataPath}: ${reference}`);
  }
}

function parseFileEntries(content) {
  const entries = [];
  let currentEntry;
  let inFiles = false;

  const finishEntry = () => {
    if (currentEntry) entries.push(currentEntry);
    currentEntry = undefined;
  };

  for (const line of content.split(/\r?\n/)) {
    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      continue;
    }
    if (!inFiles) continue;

    const urlMatch = line.match(/^\s*-\s*url:\s*(.+)$/);
    if (urlMatch) {
      finishEntry();
      currentEntry = { reference: parseScalar(urlMatch[1]) };
      continue;
    }
    if (/^\S/.test(line)) {
      finishEntry();
      inFiles = false;
      continue;
    }
    if (!currentEntry) continue;

    const sha512Match = line.match(/^\s+sha512:\s*(.+)$/);
    if (sha512Match) {
      currentEntry.sha512 = parseScalar(sha512Match[1]);
      continue;
    }
    const sizeMatch = line.match(/^\s+size:\s*(.+)$/);
    if (sizeMatch) currentEntry.size = Number(parseScalar(sizeMatch[1]));
  }
  finishEntry();

  if (entries.length === 0) {
    throw new Error(`Updater metadata has no files[].url entries: ${metadataPath}`);
  }

  const entriesByReference = new Map();
  for (const entry of entries) {
    validateReference(entry.reference);
    if (!entry.sha512 || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error(`Updater metadata entry is missing valid sha512/size: ${metadataPath} -> ${entry.reference}`);
    }

    const existingEntry = entriesByReference.get(entry.reference);
    if (existingEntry && (existingEntry.sha512 !== entry.sha512 || existingEntry.size !== entry.size)) {
      throw new Error(`Updater metadata contains conflicting entries for ${entry.reference}: ${metadataPath}`);
    }
    entriesByReference.set(entry.reference, entry);
  }

  const topLevelPath = content.match(/^path:\s*(.+)$/m)?.[1];
  if (topLevelPath) {
    const reference = parseScalar(topLevelPath);
    validateReference(reference);
    if (!entriesByReference.has(reference)) {
      throw new Error(`Updater metadata path has no matching files[] entry: ${metadataPath} -> ${reference}`);
    }
  }

  return [...entriesByReference.values()];
}

async function fileSha512(filePath) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('base64');
}

async function fileMatchesMetadata(filePath, entry) {
  if (statSync(filePath).size !== entry.size) return false;
  return (await fileSha512(filePath)) === entry.sha512;
}

async function materializeAliases() {
  const content = readFileSync(metadataPath, 'utf8');
  const entries = parseFileEntries(content);
  const artifactDir = dirname(metadataPath);

  for (const entry of entries) {
    const aliasPath = join(outputDir, entry.reference);
    if (existsSync(aliasPath)) {
      if (!(await fileMatchesMetadata(aliasPath, entry))) {
        throw new Error(`Existing updater alias failed sha512/size validation: ${entry.reference}`);
      }
      console.log(`Validated updater alias: ${entry.reference}`);
      continue;
    }

    const extension = extname(entry.reference).toLowerCase();
    if (!extension) {
      throw new Error(`Updater metadata reference has no file extension: ${metadataPath} -> ${entry.reference}`);
    }

    const candidateArtifacts = readdirSync(artifactDir, { withFileTypes: true })
      .filter((item) => item.isFile() && extname(item.name).toLowerCase() === extension)
      .map((item) => join(artifactDir, item.name));
    const matchingArtifacts = [];
    for (const filePath of candidateArtifacts) {
      if (await fileMatchesMetadata(filePath, entry)) matchingArtifacts.push(filePath);
    }

    if (matchingArtifacts.length !== 1) {
      throw new Error(
        `Expected exactly one ${extension} source artifact matching sha512/size for ${entry.reference} beside ${metadataPath}; found ${matchingArtifacts.length}`
      );
    }

    mkdirSync(outputDir, { recursive: true });
    copyFileSync(matchingArtifacts[0], aliasPath);
    if (!(await fileMatchesMetadata(aliasPath, entry))) {
      throw new Error(`Created updater alias failed sha512/size validation: ${entry.reference}`);
    }
    console.log(`Created updater alias: ${entry.reference} <- ${basename(matchingArtifacts[0])}`);
  }
}

materializeAliases().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${message}`);
  process.exitCode = 1;
});
NODE
  then
    MISSING=1
  fi
}

materialize_metadata_aliases "$WIN_X64_LATEST"
materialize_metadata_aliases "$WIN_ARM64_LATEST"
materialize_metadata_aliases "$MAC_X64_LATEST"
materialize_metadata_aliases "$MAC_ARM64_LATEST"
materialize_metadata_aliases "$LINUX_X64_LATEST"
materialize_metadata_aliases "$LINUX_ARM64_LATEST"

# ---------------------------------------------------------------------------
# 5) Hard validation for required updater metadata
# ---------------------------------------------------------------------------
echo "==> Validating required metadata ..."

VERSION="${MOCK_VERSION:-$(node -p "require('./package.json').version")}"
for required in latest.yml latest-mac.yml latest-linux.yml latest-linux-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$required" ]; then
    echo "::error::Missing required updater metadata: $required"
    MISSING=1
  fi
done

# ---------------------------------------------------------------------------
# 5b) Hard validation for desktop release assets
# ---------------------------------------------------------------------------
echo "==> Validating desktop release assets ..."

for arch in x64 arm64; do
  for ext in dmg zip; do
    asset="LianLiaoAIPC-${VERSION}-mac-${arch}.${ext}"
    if [ ! -f "$OUTPUT_DIR/$asset" ]; then
      if [ "$ext" = "zip" ]; then
        echo "::error::Missing macOS zip artifact: $asset"
      else
        echo "::error::Missing macOS DMG artifact: $asset"
      fi
      MISSING=1
    fi
  done
done

# ---------------------------------------------------------------------------
# 5c) Hard validation for web-cli release assets
# ---------------------------------------------------------------------------
echo "==> Validating web-cli assets ..."

WEB_PLATFORMS=(
  "darwin-arm64"
  "darwin-x86_64"
  "linux-arm64"
  "linux-x86_64"
  "win-x86_64"
)

for plat in "${WEB_PLATFORMS[@]}"; do
  tarball="aionui-web-${VERSION}-${plat}.tar.gz"
  if [ ! -f "$OUTPUT_DIR/$tarball" ]; then
    echo "::error::Missing web-cli tarball: $tarball"
    MISSING=1
  fi
  if [ ! -f "$OUTPUT_DIR/${tarball}.sha256" ]; then
    echo "::error::Missing web-cli checksum: ${tarball}.sha256"
    MISSING=1
  fi
done

if [ ! -f "$OUTPUT_DIR/install-web.sh" ]; then
  echo "::error::Missing install-web.sh"
  MISSING=1
fi

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

echo ""
echo "==> Prepared release assets:"
ls -lh "$OUTPUT_DIR"
echo ""
echo "==> Done."
