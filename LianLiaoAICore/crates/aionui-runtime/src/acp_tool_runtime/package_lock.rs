use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::ManagedAcpToolError;

const LOCK_CONTENTS: &str = include_str!("../../../../managed-acp-lock.json");
const SUPPORTED_RUNTIME_KEYS: [&str; 6] = [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-arm64",
    "win32-x64",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedAcpDependencyLock {
    schema_version: u8,
    codex_acp: CodexAcpDependencyLock,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexAcpDependencyLock {
    bridge: LockedPackage,
    codex_cli: LockedPackage,
    platforms: BTreeMap<String, LockedPlatformPackage>,
}

#[derive(Debug, Clone, Deserialize)]
struct LockedPackage {
    package: String,
    version: String,
    integrity: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockedPlatformPackage {
    alias_package: String,
    package: String,
    version: String,
    integrity: String,
    executable: String,
}

pub(super) fn codex_install_specs() -> Result<[String; 2], ManagedAcpToolError> {
    let lock = dependency_lock()?;
    Ok([
        format!("{}@{}", lock.codex_acp.bridge.package, lock.codex_acp.bridge.version),
        format!(
            "{}@{}",
            lock.codex_acp.codex_cli.package, lock.codex_acp.codex_cli.version
        ),
    ])
}

pub(super) fn codex_platform_executable(runtime_key: &str) -> Result<PathBuf, ManagedAcpToolError> {
    let lock = dependency_lock()?;
    Ok(PathBuf::from(&platform_lock(&lock, runtime_key)?.executable))
}

/// Validate the npm lock before installation and the installed package manifests afterwards.
/// npm verifies every tarball integrity during `npm ci`; these checks additionally prevent a
/// newly generated lock from selecting a different Codex or platform package version.
pub(super) fn validate_codex_artifact(project_dir: &Path, runtime_key: &str) -> Result<(), ManagedAcpToolError> {
    let lock = dependency_lock()?;
    let platform = platform_lock(&lock, runtime_key)?;
    validate_package_lock(project_dir, &lock.codex_acp, platform)?;
    validate_installed_package(
        project_dir,
        &lock.codex_acp.bridge.package,
        &lock.codex_acp.bridge.version,
    )?;
    validate_installed_package(
        project_dir,
        &lock.codex_acp.codex_cli.package,
        &lock.codex_acp.codex_cli.version,
    )?;
    validate_installed_package(project_dir, &platform.alias_package, &platform.version)?;

    let executable = project_dir.join(&platform.executable);
    if !executable.is_file() {
        return Err(ManagedAcpToolError::invalid(format!(
            "locked Codex platform executable missing: {}",
            executable.display()
        )));
    }
    Ok(())
}

pub(super) fn validate_codex_package_lock(project_dir: &Path, runtime_key: &str) -> Result<(), ManagedAcpToolError> {
    let lock = dependency_lock()?;
    let platform = platform_lock(&lock, runtime_key)?;
    validate_package_lock(project_dir, &lock.codex_acp, platform)
}

fn dependency_lock() -> Result<ManagedAcpDependencyLock, ManagedAcpToolError> {
    let lock: ManagedAcpDependencyLock = serde_json::from_str(LOCK_CONTENTS)
        .map_err(|error| ManagedAcpToolError::invalid(format!("parse embedded managed ACP lock: {error}")))?;
    validate_lock_schema(&lock)?;
    Ok(lock)
}

fn validate_lock_schema(lock: &ManagedAcpDependencyLock) -> Result<(), ManagedAcpToolError> {
    if lock.schema_version != 1 {
        return Err(ManagedAcpToolError::invalid(format!(
            "unsupported managed ACP lock schemaVersion {}",
            lock.schema_version
        )));
    }
    for runtime_key in SUPPORTED_RUNTIME_KEYS {
        let platform = lock.codex_acp.platforms.get(runtime_key).ok_or_else(|| {
            ManagedAcpToolError::invalid(format!("managed ACP lock missing Codex platform {runtime_key}"))
        })?;
        for (field, value) in [
            ("aliasPackage", platform.alias_package.as_str()),
            ("package", platform.package.as_str()),
            ("version", platform.version.as_str()),
            ("integrity", platform.integrity.as_str()),
            ("executable", platform.executable.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(ManagedAcpToolError::invalid(format!(
                    "managed ACP lock Codex platform {runtime_key} has empty {field}"
                )));
            }
        }
    }
    Ok(())
}

fn platform_lock<'a>(
    lock: &'a ManagedAcpDependencyLock,
    runtime_key: &str,
) -> Result<&'a LockedPlatformPackage, ManagedAcpToolError> {
    lock.codex_acp.platforms.get(runtime_key).ok_or_else(|| {
        ManagedAcpToolError::invalid(format!(
            "managed ACP lock does not support Codex platform {runtime_key}"
        ))
    })
}

fn validate_package_lock(
    project_dir: &Path,
    lock: &CodexAcpDependencyLock,
    platform: &LockedPlatformPackage,
) -> Result<(), ManagedAcpToolError> {
    let lock_path = project_dir.join("package-lock.json");
    let value = read_json(&lock_path, "Codex package lock")?;
    let packages = value
        .get("packages")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            ManagedAcpToolError::invalid(format!(
                "Codex package lock has no packages object: {}",
                lock_path.display()
            ))
        })?;
    let root_dependencies = packages
        .get("")
        .and_then(|root| root.get("dependencies"))
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            ManagedAcpToolError::invalid(format!(
                "Codex package lock has no root dependencies: {}",
                lock_path.display()
            ))
        })?;

    validate_root_dependency(root_dependencies, &lock.bridge)?;
    validate_root_dependency(root_dependencies, &lock.codex_cli)?;
    validate_lock_package(
        packages,
        &lock.bridge.package,
        &lock.bridge.version,
        &lock.bridge.integrity,
        None,
    )?;
    validate_lock_package(
        packages,
        &lock.codex_cli.package,
        &lock.codex_cli.version,
        &lock.codex_cli.integrity,
        None,
    )?;
    validate_lock_package(
        packages,
        &platform.alias_package,
        &platform.version,
        &platform.integrity,
        Some(&platform.package),
    )?;
    Ok(())
}

fn validate_root_dependency(
    dependencies: &serde_json::Map<String, serde_json::Value>,
    package: &LockedPackage,
) -> Result<(), ManagedAcpToolError> {
    let actual = dependencies.get(&package.package).and_then(serde_json::Value::as_str);
    if actual != Some(package.version.as_str()) {
        return Err(ManagedAcpToolError::invalid(format!(
            "Codex root dependency {} must be exactly {}, got {}",
            package.package,
            package.version,
            actual.unwrap_or("<missing>")
        )));
    }
    Ok(())
}

fn validate_lock_package(
    packages: &serde_json::Map<String, serde_json::Value>,
    package_name: &str,
    expected_version: &str,
    expected_integrity: &str,
    expected_real_name: Option<&str>,
) -> Result<(), ManagedAcpToolError> {
    let key = format!("node_modules/{package_name}");
    let package = packages
        .get(&key)
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| ManagedAcpToolError::invalid(format!("Codex package lock missing {key}")))?;
    require_json_string(package, &key, "version", expected_version)?;
    require_json_string(package, &key, "integrity", expected_integrity)?;
    if let Some(expected_name) = expected_real_name {
        require_json_string(package, &key, "name", expected_name)?;
    }
    Ok(())
}

fn require_json_string(
    object: &serde_json::Map<String, serde_json::Value>,
    package_key: &str,
    field: &str,
    expected: &str,
) -> Result<(), ManagedAcpToolError> {
    let actual = object.get(field).and_then(serde_json::Value::as_str);
    if actual != Some(expected) {
        return Err(ManagedAcpToolError::invalid(format!(
            "Codex package lock {package_key}.{field} mismatch: expected {expected}, got {}",
            actual.unwrap_or("<missing>")
        )));
    }
    Ok(())
}

fn validate_installed_package(
    project_dir: &Path,
    package_name: &str,
    expected_version: &str,
) -> Result<(), ManagedAcpToolError> {
    let package_path = project_dir.join("node_modules").join(package_name).join("package.json");
    let value = read_json(&package_path, "installed Codex package manifest")?;
    let actual = value.get("version").and_then(serde_json::Value::as_str);
    if actual != Some(expected_version) {
        return Err(ManagedAcpToolError::invalid(format!(
            "installed Codex package {package_name} version mismatch: expected {expected_version}, got {}",
            actual.unwrap_or("<missing>")
        )));
    }
    Ok(())
}

fn read_json(path: &Path, label: &str) -> Result<serde_json::Value, ManagedAcpToolError> {
    let contents = fs::read_to_string(path).map_err(ManagedAcpToolError::io)?;
    serde_json::from_str(&contents)
        .map_err(|error| ManagedAcpToolError::invalid(format!("parse {label} {}: {error}", path.display())))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_installed_package(root: &Path, package_name: &str, version: &str) {
        let package_root = root.join("node_modules").join(package_name);
        fs::create_dir_all(&package_root).unwrap();
        fs::write(
            package_root.join("package.json"),
            serde_json::to_vec(&serde_json::json!({ "version": version })).unwrap(),
        )
        .unwrap();
    }

    fn write_valid_windows_artifact(root: &Path) {
        let lock = dependency_lock().unwrap();
        let platform = platform_lock(&lock, "win32-x64").unwrap();
        let value = serde_json::json!({
            "packages": {
                "": { "dependencies": {
                    "@agentclientprotocol/codex-acp": lock.codex_acp.bridge.version,
                    "@openai/codex": lock.codex_acp.codex_cli.version
                }},
                "node_modules/@agentclientprotocol/codex-acp": {
                    "version": lock.codex_acp.bridge.version,
                    "integrity": lock.codex_acp.bridge.integrity
                },
                "node_modules/@openai/codex": {
                    "version": lock.codex_acp.codex_cli.version,
                    "integrity": lock.codex_acp.codex_cli.integrity
                },
                "node_modules/@openai/codex-win32-x64": {
                    "name": platform.package,
                    "version": platform.version,
                    "integrity": platform.integrity
                }
            }
        });
        fs::write(root.join("package-lock.json"), serde_json::to_vec(&value).unwrap()).unwrap();
        write_installed_package(root, &lock.codex_acp.bridge.package, &lock.codex_acp.bridge.version);
        write_installed_package(
            root,
            &lock.codex_acp.codex_cli.package,
            &lock.codex_acp.codex_cli.version,
        );
        write_installed_package(root, &platform.alias_package, &platform.version);
        let executable = root.join(&platform.executable);
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(executable, b"codex").unwrap();
    }

    #[test]
    fn embedded_lock_covers_every_runtime() {
        let lock = dependency_lock().expect("embedded lock");
        assert_eq!(lock.codex_acp.platforms.len(), SUPPORTED_RUNTIME_KEYS.len());
        assert_eq!(codex_install_specs().unwrap()[1], "@openai/codex@0.144.6");
    }

    #[test]
    fn package_lock_rejects_integrity_drift() {
        let tmp = tempfile::tempdir().unwrap();
        let lock = dependency_lock().unwrap();
        let platform = platform_lock(&lock, "win32-x64").unwrap();
        let value = serde_json::json!({
            "packages": {
                "": { "dependencies": {
                    "@agentclientprotocol/codex-acp": "1.1.2",
                    "@openai/codex": "0.144.6"
                }},
                "node_modules/@agentclientprotocol/codex-acp": {
                    "version": lock.codex_acp.bridge.version,
                    "integrity": lock.codex_acp.bridge.integrity
                },
                "node_modules/@openai/codex": {
                    "version": lock.codex_acp.codex_cli.version,
                    "integrity": "sha512-tampered"
                },
                "node_modules/@openai/codex-win32-x64": {
                    "name": platform.package,
                    "version": platform.version,
                    "integrity": platform.integrity
                }
            }
        });
        fs::write(
            tmp.path().join("package-lock.json"),
            serde_json::to_vec(&value).unwrap(),
        )
        .unwrap();

        let error = validate_codex_package_lock(tmp.path(), "win32-x64").unwrap_err();
        assert!(error.to_string().contains("integrity mismatch"), "{error}");
    }

    #[test]
    fn artifact_accepts_exact_locked_windows_packages() {
        let tmp = tempfile::tempdir().unwrap();
        write_valid_windows_artifact(tmp.path());

        validate_codex_artifact(tmp.path(), "win32-x64").expect("locked artifact");
    }

    #[test]
    fn artifact_rejects_installed_version_drift() {
        let tmp = tempfile::tempdir().unwrap();
        write_valid_windows_artifact(tmp.path());
        write_installed_package(tmp.path(), "@openai/codex", "0.145.0");

        let error = validate_codex_artifact(tmp.path(), "win32-x64").unwrap_err();
        assert!(error.to_string().contains("version mismatch"), "{error}");
    }
}
