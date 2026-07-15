#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
ERRORS=0

for f in latest.yml latest-win-arm64.yml latest-mac.yml latest-arm64-mac.yml latest-linux.yml latest-linux-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing updater metadata: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

validate_metadata_artifacts() {
  local metadata_name="$1"
  local expected_pattern="$2"
  local metadata_path="$OUTPUT_DIR/$metadata_name"
  if [ ! -f "$metadata_path" ]; then
    return
  fi

  if ! node - "$metadata_path" "$OUTPUT_DIR" "$expected_pattern" <<'NODE'
const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readFileSync, statSync } = require('node:fs');
const { basename, isAbsolute, join } = require('node:path');

const [metadataPath, outputDir, expectedPattern] = process.argv.slice(2);

function parseScalar(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.at(-1) === first) return trimmed.slice(1, -1);
  return trimmed;
}

function validateReference(reference) {
  const isSafeAsciiBasename =
    /^[0-9A-Za-z._-]+$/.test(reference) &&
    !reference.includes('..') &&
    basename(reference) === reference &&
    !isAbsolute(reference);
  if (!isSafeAsciiBasename) throw new Error(`unsafe artifact reference: ${reference}`);
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

  if (entries.length === 0) throw new Error('metadata has no files[].url entries');

  const entriesByReference = new Map();
  for (const entry of entries) {
    validateReference(entry.reference);
    if (!entry.sha512 || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error(`metadata entry is missing valid sha512/size: ${entry.reference}`);
    }
    const existingEntry = entriesByReference.get(entry.reference);
    if (existingEntry && (existingEntry.sha512 !== entry.sha512 || existingEntry.size !== entry.size)) {
      throw new Error(`metadata contains conflicting entries for ${entry.reference}`);
    }
    entriesByReference.set(entry.reference, entry);
  }

  const topLevelPath = content.match(/^path:\s*(.+)$/m)?.[1];
  if (topLevelPath) {
    const reference = parseScalar(topLevelPath);
    validateReference(reference);
    if (!entriesByReference.has(reference)) throw new Error(`metadata path has no matching files[] entry: ${reference}`);
  }

  return [...entriesByReference.values()];
}

async function fileSha512(filePath) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('base64');
}

async function validateArtifacts() {
  const entries = parseFileEntries(readFileSync(metadataPath, 'utf8'));
  const referencePattern = new RegExp(expectedPattern);

  for (const entry of entries) {
    if (!referencePattern.test(entry.reference)) {
      throw new Error(`metadata points to unexpected file: ${entry.reference}`);
    }

    const artifactPath = join(outputDir, entry.reference);
    if (!existsSync(artifactPath)) throw new Error(`metadata references missing file: ${entry.reference}`);
    const sizeMatches = statSync(artifactPath).size === entry.size;
    const hashMatches = sizeMatches && (await fileSha512(artifactPath)) === entry.sha512;
    if (!hashMatches) throw new Error(`metadata sha512/size mismatch: ${entry.reference}`);
    console.log(`PASS: ${basename(metadataPath)} -> ${entry.reference} (sha512/size)`);
  }
}

validateArtifacts().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${basename(metadataPath)} ${message}`);
  process.exitCode = 1;
});
NODE
  then
    ERRORS=$((ERRORS + 1))
  fi
}

validate_metadata_artifacts "latest.yml" "\\.exe$"
validate_metadata_artifacts "latest-win-arm64.yml" "arm64.*\\.exe$"
validate_metadata_artifacts "latest-mac.yml" "mac\\.zip$"
validate_metadata_artifacts "latest-arm64-mac.yml" "arm64-mac\\.zip$"
validate_metadata_artifacts "latest-linux.yml" "amd64\\.deb$"
validate_metadata_artifacts "latest-linux-arm64.yml" "arm64\\.deb$"

for f in 链辽AI-1.0.0-win-x64.exe 链辽AI-1.0.0-win-arm64.exe 链辽AI-1.0.0-mac-x64.dmg 链辽AI-1.0.0-mac-x64.zip 链辽AI-1.0.0-mac-arm64.dmg 链辽AI-1.0.0-mac-arm64.zip 链辽AI-1.0.0.deb 链辽AI-1.0.0-arm64.deb; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing distributable: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

# Web-CLI tarballs + checksums
for plat in darwin-arm64 darwin-x86_64 linux-arm64 linux-x86_64 win-x86_64; do
  tarball="aionui-web-1.0.0-${plat}.tar.gz"
  for f in "$tarball" "${tarball}.sha256"; do
    if [ ! -f "$OUTPUT_DIR/$f" ]; then
      echo "FAIL: missing web-cli asset: $f"
      ERRORS=$((ERRORS + 1))
    else
      echo "PASS: $f exists"
    fi
  done
done

if [ ! -f "$OUTPUT_DIR/install-web.sh" ]; then
  echo "FAIL: missing install-web.sh"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: install-web.sh exists"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors found"
  exit 1
fi

echo "ALL CHECKS PASSED"
