use crate::commands::fs::{read_file_impl, FileContent};
use crate::commands::settings::config_value_to_json;
use crate::commands::workspace::{
    build_restore_bundle, load_recent_workspaces, watch_standalone_file_impl,
    RestoreWorkspaceResponse,
};
use crate::config::DEFAULT_FOLDER_KEY;
use crate::error::AppError;
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri::Manager;

const RESTORE_WORKSPACE_KEY: &str = "window.restore-workspace";

fn restore_target(
    explicit_workspace: Option<&str>,
    default_folder: &str,
    restore_enabled: bool,
    recent_workspaces: &[String],
) -> Option<String> {
    if let Some(path) = explicit_workspace {
        return Some(path.to_owned());
    }
    if !default_folder.is_empty() {
        // Do not discard a saved choice when iCloud or a removable disk is
        // temporarily unavailable. Opening it will produce a recovery error.
        return Some(default_folder.to_owned());
    }
    restore_enabled
        .then(|| {
            recent_workspaces
                .iter()
                .find(|path| Path::new(path).is_dir())
                .cloned()
        })
        .flatten()
}

#[derive(Debug, Serialize)]
pub struct StartupState {
    pub settings: Value,
    pub recent_workspaces: Vec<String>,
    /// Workspace restore payload. Populated for folder opens and session
    /// restores; `None` for standalone file opens and the welcome screen.
    pub restore_bundle: Option<RestoreWorkspaceResponse>,
    /// Standalone compact-mode open (CLI arg / drag-drop of a markdown
    /// file). Mutually exclusive with `restore_bundle`: no workspace is
    /// prepared, no indexing runs — only the prefetched file content and a
    /// single-file watcher started before this returns.
    pub standalone_file: Option<FileContent>,
    pub restore_error: Option<String>,
}

#[tauri::command]
pub async fn get_startup_state(
    webview: tauri::Webview,
    app: tauri::AppHandle,
) -> Result<StartupState, AppError> {
    let label = webview.label().to_string();
    let state = app.state::<AppState>().get_or_create(&label);

    let (settings, restore_enabled, default_folder) = {
        let guard = state.settings.read();
        match guard.as_ref() {
            Some(s) => {
                let merged = s.merged();
                let restore_enabled = merged
                    .get(RESTORE_WORKSPACE_KEY)
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let default_folder = s
                    .get_global_or_default(DEFAULT_FOLDER_KEY)
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_owned();
                let mut obj = serde_json::Map::new();
                for (k, v) in &merged {
                    obj.insert(k.clone(), config_value_to_json(v));
                }
                (Value::Object(obj), restore_enabled, default_folder)
            }
            None => return Err(AppError::Io("Settings not initialized".into())),
        }
    };

    let recent_workspaces = load_recent_workspaces(&app).unwrap_or_default();
    let startup_open = state.take_startup_open();

    // Standalone file open (CLI arg / drag-drop of a markdown file): no
    // workspace is prepared at all — no watcher tree, no gitignore load, no
    // index walk. Prefetch the file content so the compact editor mounts
    // loaded, and start the lightweight single-file watcher.
    if let Some(payload) = &startup_open {
        if payload.workspace.is_none() {
            if let Some(file) = &payload.file {
                let standalone_file = match read_file_impl(file) {
                    Ok(content) => Some(content),
                    Err(err) => {
                        // File vanished between the open event and startup —
                        // fall through to the welcome screen.
                        eprintln!("failed to read standalone startup file {file}: {err:?}");
                        None
                    }
                };
                if standalone_file.is_some() {
                    if let Err(err) = watch_standalone_file_impl(&app, &label, file) {
                        eprintln!("failed to start standalone file watcher: {err:?}");
                    }
                }
                return Ok(StartupState {
                    settings,
                    recent_workspaces,
                    restore_bundle: None,
                    standalone_file,
                    restore_error: None,
                });
            }
        }
    }

    // Pick a workspace to prefetch a bundle for so the frontend can hydrate
    // synchronously on first render — no second IPC waterfall, no welcome
    // screen flash. startup_open is set during window creation (from CLI
    // args or open_new_workspace_window) before the webview loads — same
    // lifecycle as settings. No runtime event touches it.
    let restore_target = restore_target(
        startup_open
            .as_ref()
            .and_then(|payload| payload.workspace.as_deref()),
        &default_folder,
        restore_enabled,
        &recent_workspaces,
    );

    let mut restore_error = None;
    let mut restore_bundle = if let Some(path) = restore_target {
        match build_restore_bundle(&app, &label, &path).await {
            Ok(bundle) => Some(bundle),
            Err(err) => {
                // Don't let a failed restore abort startup — settings still
                // need to hydrate and the welcome screen should render.
                eprintln!("failed to prefetch restore bundle for {path}: {err:?}");
                restore_error = Some(format!(
                    "Could not open {path}: {err}. Make sure the folder is available, then try again or choose another folder."
                ));
                None
            }
        }
    } else {
        None
    };

    // A workspace+file payload (open_workspace_in_new_window with a file)
    // opens that file as a normal tab instead of restoring the previous
    // session — the user asked for a specific file, not their old tabs.
    if let Some(pending) = startup_open {
        if pending.workspace.is_some() {
            if let Some(ref mut bundle) = restore_bundle {
                bundle.session = None;
                bundle.active_file = None;
                bundle.open_file = pending.file;
            }
        }
    }

    Ok(StartupState {
        settings,
        recent_workspaces,
        restore_bundle,
        standalone_file: None,
        restore_error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_target_prioritizes_explicit_opens_then_saved_folder() {
        let recent = tempfile::tempdir().unwrap();
        let recents = vec![recent.path().to_string_lossy().into_owned()];
        assert_eq!(
            restore_target(Some("/explicit"), "/saved", true, &recents),
            Some("/explicit".into())
        );
        assert_eq!(
            restore_target(None, "/saved", false, &recents),
            Some("/saved".into())
        );
        assert_eq!(
            restore_target(None, "/missing-saved-folder", true, &recents),
            Some("/missing-saved-folder".into())
        );
    }

    #[test]
    fn restore_target_skips_missing_recent_folders_without_a_saved_choice() {
        let available = tempfile::tempdir().unwrap();
        let path = available.path().to_string_lossy().into_owned();
        let recents = vec!["/missing-recent-folder".into(), path.clone()];
        assert_eq!(restore_target(None, "", true, &recents), Some(path));
        assert_eq!(restore_target(None, "", false, &recents), None);
        assert_eq!(restore_target(None, "", true, &[]), None);
    }
}
