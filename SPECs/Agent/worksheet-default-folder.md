# Default folder worksheet

Task: `TODOS.md` In Progress; spec: `SPECs/default-folder-spec.md`.

Fresh clone of `rookbreezy/writer-computer` (upstream `joelbqz/writer-computer`), initially clean. Reviewed AGENTS, agent-loop/review, React/Zustand/consolidation/Vite+ docs; settings schema/store/control; workspace store/commands, startup IPC and frontend bootstrap, updater and telemetry.

Findings: startup selects only recent[0] if it exists, and catches restore failures into a null bundle with console-only logs. Recent workspaces and global settings are independent; no explicit chosen-folder preference exists. `openWorkspace` preserves existing workspace windows, and default selection will use that established path. Settings persist globally to the app data `config` file with serialized writes and rollback.

Plan:

1. Add globally scoped saved folder in the schema; render a dedicated Folder card first in Settings, excluded from the generic renderer, using a domain hook for persistence/opening. Remove unused sidebar switcher.
2. Extract/test startup target selection; prioritize explicit opens, then saved folder, then first existing recent if restore enabled. Add optional startup error to IPC; frontend opens Settings and displays the recovery message there.
3. Test a fresh Settings instance loading the chosen folder from disk (including spaces), workspace override immunity, target priority/missing recents/restore toggle, and picker cancel/persistence failures. Run repository validation and browser QA.
4. Document network destinations/conditions in `docs/network-audit.md`; preserve behavior as requested. Update changelog/TODO/worksheet, commit and push to user's fork, place checkout in `/Users/taco/Code/writer-computer`.

Risks: inaccessible iCloud/removable paths must not erase the saved choice; explicit file opens must keep compact behavior; saved default must not be overridden by workspace config. Choosing another folder uses the existing new-window policy to preserve unsaved work. Native filesystem restoration needs Rust tests; browser QA cannot independently prove macOS relaunch behavior.

Validation setup: Vite+ absent globally, bootstrapping pinned 0.1.22 through pnpm dlx to run `vp install --frozen-lockfile`. Rust baseline `cargo test --locked` compiling dependencies.

## Plan review amendments

React, Rust/Tauri and Startup reviewers required two amendments: render the active Settings tab even without a root; use `handleOpenPayload` so compact/occupied windows retain their edits. Failed picker opens restore/focus Settings and use a shared transient workspace error, retained on cancellation and cleared only on successful recovery. Protect post-prepare restore failure cleanup with captured root + epoch. Reject folder paths with line breaks or outer whitespace before writing because the existing config format cannot round-trip them. Add regression coverage for each.

Baseline: 790 frontend tests pass, Rust fmt passes, clippy passes with 11 existing warnings. Rust tests: 167 pass; the existing trash integration test fails because macOS denies Apple Events to Finder (-1743). No production change to trash or permission settings is in scope. Frontend check initially only flagged formatting of this new worksheet; format before final checks.

Further plan refinements: default selection uses an exported queued folder-open wrapper so it shares serialization with CLI/drop. Rootless `openWorkspace` uses `restoreWorkspace` + `restoreFromBundle`, preserving current UI until bundle success and consolidating hydration. Error reporting belongs to a workspace-store action; components subscribe through narrow hooks. UX and QA reviewers approve amended plan.

## Implementation and validation progress

Implemented global folder persistence, top Settings card, queued folder opening, rootless Settings visibility, shared recovery errors, and root+epoch backend cleanup. Legacy Welcome/command-palette folder opens now share the same queue (State reviewer amendment). Removed the unused footer switcher. The real disk reload/global-only tests pass, including spaces/Unicode and rejection-before-write cases. New frontend tests cover persistence ordering, cancellation, write/open failures, retry, dirty compact preservation, queue overlap and rendered rootless recovery. Browser QA exposed an unhydrated Settings crash when the native backend is unavailable; schema defaults now keep recovery controls renderable.

172 Rust tests pass with the pre-existing Finder trash integration test excluded after its documented permission failure. Native debug Writer.app and production frontend bundled successfully without a telemetry key. Full frontend tests/checks and implementation reviews are in progress.

## Final review and handoff

All seven review personas approve. Addressed their implementation findings: clear stale recovery errors after successful same-root/delegated opens; honor the merged Restore Open Files setting before loading a restore bundle session; queue Welcome's picked folder and file atomically so they cannot land in different windows. Regression tests added for these paths.

Validation: `vp check` passes (one pre-existing E2E typing warning); full frontend suite passes; 173 Rust tests pass with only the existing Finder trash integration test excluded after the baseline -1743 automation-denial failure. `cargo clippy` passes with the same 11 baseline warnings; `cargo fmt --check` passes; frontend TypeScript/production build and ARM64 macOS debug app bundle succeed. No test assertions were weakened.

Built-in-browser QA confirmed the top Folder card, visible error recovery without a root, and absent footer selector. Manual native quit/relaunch was attempted with an isolated bundle identifier, but computer-use access to Writer Folder QA was not approved. It remains unverified manually; real disk reload tests exercise durable persistence. No installed user Writer app or settings were changed.

Deliverables: source checkout `/Users/taco/Code/writer-computer`, user's GitHub fork, `outputs/Writer-personal-fork-arm64.zip`, and `outputs/network-audit.md`. Built without `WRITER_POSTHOG_KEY`; updater behavior is preserved and still points to upstream.
