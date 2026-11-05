# Remember one default folder

User request: fork Writer, hide the bottom-left folder selector, and put a single folder picker at the top of Settings. The selected folder must survive quit/relaunch. Report network behavior without changing it.

- A global `workspace.default-folder` string is persisted through the existing settings write pipeline. No browser storage. Empty means the existing recent-workspace fallback.
- Settings begins with a Folder card with the full saved path, Choose/Change Folder button, cancellation handling, a busy state, and visible errors. Folder selection persists before opening; existing open-payload handling preserves current workspace and compact-file edits. Failed opens re-focus Settings and expose a shared recovery error. Folder names with line breaks or outer whitespace are rejected visibly before persistence because the config format cannot preserve them.
- Ordinary startup prioritizes the saved folder independently of `window.restore-workspace` and the recent-folder list. Explicit CLI/Finder file/folder requests retain priority. No stale-first-recent early exit; search for the first available recent directory when no default is saved.
- Failed saved-folder restoration retains the saved setting and opens Settings with a useful error instead of silently showing a blank editor. Never silently select another folder instead of the user's saved folder. Rootless Settings must render. A failed bundle clears only its own captured backend root/epoch.
- Remove the footer folder selector. Keep existing menu/CLI folder opens available.
- Validate real settings-file round trips, folder priority/fallback selection, startup error hydration, and cancellation/write failures. Run frontend checks/tests/build and Rust tests/clippy/fmt. Inspect the UI in the built-in browser.
