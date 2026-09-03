use std::collections::BTreeMap;
use std::ffi::OsString;
#[cfg(unix)]
use std::path::Path;
use std::path::PathBuf;
#[cfg(unix)]
use std::time::Duration;

use tokio::sync::OnceCell;

#[cfg(unix)]
use crate::Builder;

static FULL_SHELL_ENV: OnceCell<Vec<(OsString, OsString)>> = OnceCell::const_new();

/// Build a cleaned environment for long-running agent subprocesses.
///
/// This intentionally does not mutate the backend process environment. Agent
/// spawns should call `env_clear()` and then apply this map, matching the old
/// Electron `spawn(..., { env })` behavior without spreading shell variables to
/// unrelated backend code.
pub async fn agent_process_env() -> Vec<(OsString, OsString)> {
    build_agent_process_env(std::env::vars_os().collect(), full_shell_env().await.to_vec())
}

async fn full_shell_env() -> &'static Vec<(OsString, OsString)> {
    FULL_SHELL_ENV.get_or_init(load_full_shell_env).await
}

fn build_agent_process_env(
    current_env: Vec<(OsString, OsString)>,
    shell_env: Vec<(OsString, OsString)>,
) -> Vec<(OsString, OsString)> {
    let current_path = get_env_value(&current_env, "PATH").cloned();
    let shell_path = get_env_value(&shell_env, "PATH").cloned();
    let current_proxy_keys: std::collections::HashSet<&'static str> = current_env
        .iter()
        .filter_map(|(name, _)| proxy_env_key(name.as_os_str()))
        .collect();
    let current_protected_keys: std::collections::HashSet<&'static str> = current_env
        .iter()
        .filter_map(|(name, _)| lianliao_protected_env_key(name.as_os_str()))
        .collect();

    let mut merged: BTreeMap<OsString, OsString> = current_env.into_iter().collect();
    for (name, value) in shell_env {
        // The desktop process injects the selected proxy into Core before it
        // starts. A login shell may contain stale proxy values, so keep the
        // inherited value authoritative for both upper- and lowercase forms.
        // Proxy values remain shell-derived when Core inherited no value.
        if proxy_env_key(name.as_os_str()).is_some_and(|key| current_proxy_keys.contains(key)) {
            continue;
        }
        // These values form a process-local capability chain from Electron to
        // the built-in MCP. A login shell must never replace either value.
        if lianliao_protected_env_key(name.as_os_str()).is_some_and(|key| current_protected_keys.contains(key)) {
            continue;
        }
        merged.insert(name, value);
    }

    remove_env_key(&mut merged, "PATH");
    if let Some(path) = merge_path_values(current_path.as_deref(), shell_path.as_deref()) {
        merged.insert(OsString::from("PATH"), path);
    }

    clean_agent_env(&mut merged);
    merged.into_iter().collect()
}

fn proxy_env_key(name: &std::ffi::OsStr) -> Option<&'static str> {
    const PROXY_ENV_KEYS: [&str; 4] = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"];
    let name = name.to_string_lossy();
    PROXY_ENV_KEYS.into_iter().find(|key| name.eq_ignore_ascii_case(key))
}

fn lianliao_protected_env_key(name: &std::ffi::OsStr) -> Option<&'static str> {
    const KEYS: [&str; 2] = [
        "LIANLIAO_INDUSTRY_GATEWAY_URL",
        "LIANLIAO_INDUSTRY_GATEWAY_BOOTSTRAP_TOKEN",
    ];
    let name = name.to_string_lossy();
    KEYS.into_iter().find(|key| name.eq_ignore_ascii_case(key))
}

fn clean_agent_env(env: &mut BTreeMap<OsString, OsString>) {
    for key in ["NODE_OPTIONS", "NODE_INSPECT", "NODE_DEBUG", "CLAUDECODE"] {
        remove_env_key(env, key);
    }
    env.retain(|key, _| !env_key_starts_with(key, "npm_"));
}

fn get_env_value<'a>(env: &'a [(OsString, OsString)], key: &str) -> Option<&'a OsString> {
    env.iter()
        .find(|(name, _)| env_key_eq(name.as_os_str(), key))
        .map(|(_, value)| value)
}

fn remove_env_key(env: &mut BTreeMap<OsString, OsString>, key: &str) {
    env.retain(|name, _| !env_key_eq(name.as_os_str(), key));
}

#[cfg(windows)]
fn env_key_eq(name: &std::ffi::OsStr, key: &str) -> bool {
    name.to_string_lossy().eq_ignore_ascii_case(key)
}

#[cfg(not(windows))]
fn env_key_eq(name: &std::ffi::OsStr, key: &str) -> bool {
    name == std::ffi::OsStr::new(key)
}

#[cfg(windows)]
fn env_key_starts_with(name: &std::ffi::OsStr, prefix: &str) -> bool {
    name.to_string_lossy()
        .to_ascii_lowercase()
        .starts_with(&prefix.to_ascii_lowercase())
}

#[cfg(not(windows))]
fn env_key_starts_with(name: &std::ffi::OsStr, prefix: &str) -> bool {
    name.to_string_lossy().starts_with(prefix)
}

fn merge_path_values(current: Option<&std::ffi::OsStr>, shell: Option<&std::ffi::OsStr>) -> Option<OsString> {
    let mut seen = std::collections::HashSet::<PathBuf>::new();
    let mut parts = Vec::new();
    for value in [current, shell].into_iter().flatten() {
        for path in std::env::split_paths(value) {
            if path.as_os_str().is_empty() {
                continue;
            }
            if seen.insert(path.clone()) {
                parts.push(path);
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        std::env::join_paths(parts).ok()
    }
}

#[cfg(unix)]
async fn load_full_shell_env() -> Vec<(OsString, OsString)> {
    let Some(shell) = std::env::var_os("SHELL") else {
        return Vec::new();
    };
    if !Path::new(&shell).is_absolute() {
        tracing::debug!(shell = %shell.to_string_lossy(), "SHELL is not absolute, skipping full shell env probe");
        return Vec::new();
    }

    let result = tokio::time::timeout(Duration::from_secs(5), async {
        let mut builder = Builder::clean_cli(&shell);
        builder.args(["-i", "-l", "-c", "env"]);
        builder.output().await
    })
    .await;

    let output = match result {
        Ok(Ok(output)) => output,
        Ok(Err(error)) => {
            tracing::debug!(error = %error, "full shell env probe failed to spawn");
            return Vec::new();
        }
        Err(_) => {
            tracing::warn!("full shell env probe timed out after 5s");
            return Vec::new();
        }
    };

    if !output.status.success() {
        tracing::debug!(status = ?output.status, "full shell env probe exited non-zero");
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_env_output(&stdout);
    tracing::info!(var_count = parsed.len(), "full shell env loaded for agent subprocesses");
    parsed
}

#[cfg(not(unix))]
async fn load_full_shell_env() -> Vec<(OsString, OsString)> {
    Vec::new()
}

#[cfg(unix)]
fn parse_env_output(output: &str) -> Vec<(OsString, OsString)> {
    let mut parsed = Vec::new();
    let mut current_key: Option<String> = None;
    let mut current_value = String::new();

    for line in output.split('\n') {
        if let Some((key, value)) = parse_env_start(line) {
            if let Some(key) = current_key.replace(key.to_owned()) {
                parsed.push((OsString::from(key), OsString::from(std::mem::take(&mut current_value))));
            }
            current_value.push_str(value);
        } else if current_key.is_some() {
            current_value.push('\n');
            current_value.push_str(line);
        }
    }

    if let Some(key) = current_key {
        parsed.push((OsString::from(key), OsString::from(current_value)));
    }

    parsed
}

#[cfg(unix)]
fn parse_env_start(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once('=')?;
    if is_valid_env_key(key) {
        Some((key, value))
    } else {
        None
    }
}

#[cfg(unix)]
fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;
    #[cfg(unix)]
    use std::path::Path;

    #[cfg(unix)]
    const CHILD_MARKER: &str = "AIONUI_RUNTIME_AGENT_ENV_TEST_CHILD";

    #[test]
    fn current_proxy_env_wins_while_other_shell_values_still_merge() {
        let current_proxy_env = [
            ("HTTP_PROXY", "http://current-http:8080"),
            ("http_proxy", "http://current-http-lower:8081"),
            ("HTTPS_PROXY", "http://current-https:8443"),
            ("https_proxy", "http://current-https-lower:8444"),
            ("ALL_PROXY", "http://current-all:9000"),
            ("all_proxy", "http://current-all-lower:9001"),
            ("NO_PROXY", "localhost,127.0.0.1"),
            ("no_proxy", "localhost,127.0.0.1,::1"),
        ];
        let mut current_env: Vec<_> = current_proxy_env
            .iter()
            .map(|(key, value)| (OsString::from(*key), OsString::from(*value)))
            .collect();
        current_env.push((OsString::from("AIONUI_OVERLAY"), OsString::from("from-current")));
        let mut shell_env: Vec<_> = current_proxy_env
            .iter()
            .map(|(key, _)| (OsString::from(*key), OsString::from("from-shell")))
            .collect();
        shell_env.extend([
            (OsString::from("AIONUI_OVERLAY"), OsString::from("from-shell")),
            (OsString::from("AIONUI_SHELL_ONLY"), OsString::from("from-shell")),
        ]);

        let env = build_agent_process_env(current_env, shell_env);

        for (key, expected) in current_proxy_env {
            assert_eq!(exact_env_value(&env, key).as_deref(), Some(expected));
        }
        assert_eq!(exact_env_value(&env, "AIONUI_OVERLAY").as_deref(), Some("from-shell"));
        assert_eq!(
            exact_env_value(&env, "AIONUI_SHELL_ONLY").as_deref(),
            Some("from-shell")
        );
    }

    #[test]
    fn shell_proxy_env_is_used_only_when_current_process_has_no_matching_family() {
        let current_env = vec![(OsString::from("HTTP_PROXY"), OsString::from("http://current-http:8080"))];
        let shell_env = vec![
            (
                OsString::from("http_proxy"),
                OsString::from("http://shell-http-lower:8081"),
            ),
            (OsString::from("HTTPS_PROXY"), OsString::from("http://shell-https:8443")),
            (OsString::from("AIONUI_SHELL_ONLY"), OsString::from("from-shell")),
        ];

        let env = build_agent_process_env(current_env, shell_env);

        assert_eq!(
            exact_env_value(&env, "HTTP_PROXY").as_deref(),
            Some("http://current-http:8080")
        );
        assert!(
            exact_env_value(&env, "http_proxy").is_none(),
            "a lowercase shell proxy must not conflict with an inherited uppercase proxy"
        );
        assert_eq!(
            get_env_value(&env, "HTTPS_PROXY")
                .map(|value| value.to_string_lossy().into_owned())
                .as_deref(),
            Some("http://shell-https:8443")
        );
        assert_eq!(
            get_env_value(&env, "AIONUI_SHELL_ONLY")
                .map(|value| value.to_string_lossy().into_owned())
                .as_deref(),
            Some("from-shell")
        );
    }

    #[test]
    fn agent_process_env_preserves_lianliao_gateway_env() {
        let current_env = vec![
            (
                OsString::from("LIANLIAO_INDUSTRY_GATEWAY_URL"),
                OsString::from("http://127.0.0.1:43210"),
            ),
            (
                OsString::from("LIANLIAO_INDUSTRY_GATEWAY_BOOTSTRAP_TOKEN"),
                OsString::from("current-secret"),
            ),
        ];
        let shell_env = vec![
            (
                OsString::from("LIANLIAO_INDUSTRY_GATEWAY_URL"),
                OsString::from("http://127.0.0.1:1"),
            ),
            (
                OsString::from("LIANLIAO_INDUSTRY_GATEWAY_BOOTSTRAP_TOKEN"),
                OsString::from("shell-secret"),
            ),
            (OsString::from("LIANLIAO_SHELL_ONLY"), OsString::from("merged")),
        ];

        let env = build_agent_process_env(current_env, shell_env);

        assert_eq!(
            exact_env_value(&env, "LIANLIAO_INDUSTRY_GATEWAY_URL").as_deref(),
            Some("http://127.0.0.1:43210")
        );
        assert_eq!(
            exact_env_value(&env, "LIANLIAO_INDUSTRY_GATEWAY_BOOTSTRAP_TOKEN").as_deref(),
            Some("current-secret")
        );
        assert_eq!(exact_env_value(&env, "LIANLIAO_SHELL_ONLY").as_deref(), Some("merged"));
    }

    fn exact_env_value(env: &[(OsString, OsString)], key: &str) -> Option<String> {
        env.iter()
            .find(|(name, _)| name == OsStr::new(key))
            .map(|(_, value)| value.to_string_lossy().into_owned())
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn agent_process_env_merges_full_shell_env_and_cleans_pollution() {
        if std::env::var_os(CHILD_MARKER).is_none() {
            let temp = tempfile::tempdir().unwrap();
            let shell = temp.path().join("fake-shell");
            write_fake_shell(
                &shell,
                r#"#!/bin/sh
printf '%s\n' \
  'AIONUI_SHELL_ONLY=from-shell' \
  'AIONUI_OVERLAY=from-shell' \
  'PATH=/shell/bin:/current/bin' \
  'NODE_OPTIONS=--inspect' \
  'CLAUDECODE=1' \
  'npm_lifecycle_event=start'
"#,
            );

            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .arg("--exact")
                .arg("agent_env::tests::agent_process_env_merges_full_shell_env_and_cleans_pollution")
                .arg("--nocapture")
                .env(CHILD_MARKER, "1")
                .env("SHELL", &shell)
                .env("PATH", "/current/bin")
                .env("AIONUI_CURRENT_ONLY", "from-current")
                .env("AIONUI_OVERLAY", "from-current")
                .env("NODE_OPTIONS", "--require parent")
                .env("CLAUDECODE", "1")
                .env("npm_config_cache", "/tmp/parent-cache")
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "child test failed\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            return;
        }

        let env = agent_process_env().await;
        let value = |key: &str| {
            env.iter()
                .find(|(name, _)| name == OsStr::new(key))
                .map(|(_, value)| value.to_string_lossy().into_owned())
        };

        assert_eq!(value("AIONUI_CURRENT_ONLY").as_deref(), Some("from-current"));
        assert_eq!(value("AIONUI_SHELL_ONLY").as_deref(), Some("from-shell"));
        assert_eq!(value("AIONUI_OVERLAY").as_deref(), Some("from-shell"));
        assert_eq!(value("NODE_OPTIONS"), None);
        assert_eq!(value("CLAUDECODE"), None);
        assert_eq!(value("npm_config_cache"), None);
        assert_eq!(value("npm_lifecycle_event"), None);

        let path = value("PATH").expect("PATH should be present");
        assert!(
            path.starts_with("/current/bin"),
            "current/enhanced PATH should stay first, got {path}"
        );
        assert!(
            path.contains("/shell/bin"),
            "shell PATH entries should be appended, got {path}"
        );
    }

    #[cfg(unix)]
    fn write_fake_shell(path: &Path, contents: &str) {
        use std::os::unix::fs::PermissionsExt;

        std::fs::write(path, contents).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
}
