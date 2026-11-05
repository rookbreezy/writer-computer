import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ show: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/lib/theme", () => ({ applyTheme: vi.fn(), applyCssVarBindings: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  chooseDefaultFolder,
  DEFAULT_FOLDER_KEY,
  reopenDefaultFolder,
} from "../src/hooks/use-default-folder";
import { applyStartupState, openFolder } from "../src/hooks/use-open-drop";
import { createSettingsTab, useEditorStore } from "../src/stores/editor-store";
import { useSettingsStore } from "../src/stores/settings-store";
import { useWorkspaceStore } from "../src/stores/workspace-store";
import type { RestoreWorkspaceResponse } from "../src/lib/tauri";

const mockedInvoke = vi.mocked(invoke);
const picker = vi.mocked(open);

function bundle(root: string): RestoreWorkspaceResponse {
  return {
    workspace: { root, name: "Notes", file_count: 1, epoch: 1 },
    entries: [{ path: `${root}/note.md`, name: "note.md", is_dir: false, is_markdown: true }],
    recent_workspaces: [root],
    session: null,
    active_file: null,
    open_file: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    root: null,
    chromeMode: "workspace",
    openError: null,
    directoryCache: new Map(),
    recentWorkspaces: [],
  });
  useEditorStore.setState({
    openFiles: new Map(),
    tabs: [],
    activeTabId: null,
    activeFilePath: null,
  });
  useSettingsStore.getState().hydrateFromBackend({
    settings: { [DEFAULT_FOLDER_KEY]: "/old", "workspace.restore-open-files": true },
  });
  mockedInvoke.mockImplementation(async (command, args) => {
    const payload = args as Record<string, unknown>;
    if (command === "set_setting") return payload.value;
    if (command === "restore_workspace") return bundle(payload.path as string);
    return null;
  });
});

describe("default folder selection", () => {
  test("cancelling keeps the saved choice and recovery message", async () => {
    picker.mockResolvedValue(null);
    useWorkspaceStore.getState().reportOpenError("Disk unavailable");
    await chooseDefaultFolder();
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false }),
    );
    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().settings[DEFAULT_FOLDER_KEY]).toBe("/old");
    expect(useWorkspaceStore.getState().openError).toBe("Disk unavailable");
  });

  test("waits for durable global persistence before opening the selected folder", async () => {
    picker.mockResolvedValue("/My Notes/Æ");
    const persisted = deferred<string>();
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "set_setting") return persisted.promise;
      if (command === "restore_workspace") return bundle((args as { path: string }).path);
      return null;
    });
    const selection = chooseDefaultFolder();
    await vi.waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("set_setting", {
        key: DEFAULT_FOLDER_KEY,
        value: "/My Notes/Æ",
        scope: "global",
      }),
    );
    expect(mockedInvoke).not.toHaveBeenCalledWith("restore_workspace", expect.anything());
    persisted.resolve("/My Notes/Æ");
    await selection;
    expect(useWorkspaceStore.getState().root).toBe("/My Notes/Æ");
    expect(useWorkspaceStore.getState().directoryCache.get("/My Notes/Æ")).toHaveLength(1);
  });

  test("a failed settings write preserves the old choice and exposes recovery Settings", async () => {
    picker.mockResolvedValue("/new");
    mockedInvoke.mockRejectedValue("Disk full");
    await chooseDefaultFolder();
    expect(useSettingsStore.getState().settings[DEFAULT_FOLDER_KEY]).toBe("/old");
    expect(mockedInvoke).not.toHaveBeenCalledWith("restore_workspace", expect.anything());
    expect(useWorkspaceStore.getState().openError).toContain("Disk full");
    expect(useEditorStore.getState().tabs[0]?.location.kind).toBe("settings");
  });

  test("failed restoration preserves Settings and the saved choice until retry succeeds", async () => {
    picker.mockResolvedValue("/new");
    const settings = createSettingsTab("settings");
    useEditorStore.setState({ tabs: [settings], activeTabId: settings.id });
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "set_setting") return (args as { value: string }).value;
      if (command === "restore_workspace") throw new Error("Folder unavailable");
      return null;
    });
    await chooseDefaultFolder();
    expect(useSettingsStore.getState().settings[DEFAULT_FOLDER_KEY]).toBe("/new");
    expect(useWorkspaceStore.getState().root).toBeNull();
    expect(useEditorStore.getState().tabs).toEqual([settings]);
    expect(useWorkspaceStore.getState().openError).toContain("Folder unavailable");
    mockedInvoke.mockImplementation(async (command) =>
      command === "restore_workspace" ? bundle("/new") : null,
    );
    await reopenDefaultFolder();
    expect(useWorkspaceStore.getState().root).toBe("/new");
    expect(useWorkspaceStore.getState().openError).toBeNull();
  });

  test("a selected folder opens elsewhere while a dirty standalone file stays intact", async () => {
    picker.mockResolvedValue("/new");
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "set_setting") return (args as { value: string }).value;
      if (command === "read_file")
        return { path: "/draft.md", content: "original", modified_at: 1 };
      return null;
    });
    useWorkspaceStore.setState({ chromeMode: "compact-file" });
    await useEditorStore.getState().openCompactFile("/draft.md");
    const files = new Map(useEditorStore.getState().openFiles);
    files.set("/draft.md", { ...files.get("/draft.md")!, content: "unsaved draft", isDirty: true });
    useEditorStore.setState({ openFiles: files });
    const tabs = useEditorStore.getState().tabs;
    await chooseDefaultFolder();
    expect(mockedInvoke).toHaveBeenCalledWith("open_workspace_in_new_window", {
      path: "/new",
      file: null,
    });
    expect(useEditorStore.getState().tabs).toBe(tabs);
    expect(useEditorStore.getState().openFiles.get("/draft.md")?.content).toBe("unsaved draft");
    expect(useWorkspaceStore.getState().chromeMode).toBe("compact-file");
  });

  test("successful current-folder and delegated opens clear an earlier recovery error", async () => {
    useWorkspaceStore.setState({ root: "/old" });
    for (const folder of ["/old", "/new"]) {
      useWorkspaceStore.getState().reportOpenError("Previous open failed");
      picker.mockResolvedValue(folder);
      await chooseDefaultFolder();
      expect(useWorkspaceStore.getState().root).toBe("/old");
      expect(useWorkspaceStore.getState().openError).toBeNull();
    }
    expect(mockedInvoke).toHaveBeenCalledWith("open_workspace_in_new_window", {
      path: "/new",
      file: null,
    });
  });

  test("routes a picked file with its folder when the original window is occupied", async () => {
    useWorkspaceStore.setState({ root: "/existing" });
    const tabs = useEditorStore.getState().tabs;
    await openFolder("/new", "/new/note.md");
    expect(mockedInvoke).toHaveBeenCalledWith("open_workspace_in_new_window", {
      path: "/new",
      file: "/new/note.md",
    });
    expect(mockedInvoke).not.toHaveBeenCalledWith("read_file", expect.anything());
    expect(useEditorStore.getState().tabs).toBe(tabs);
  });

  test("serializes overlapping folder opens before deciding which window receives them", async () => {
    const first = deferred<RestoreWorkspaceResponse>();
    mockedInvoke.mockImplementation(async (command) =>
      command === "restore_workspace" ? first.promise : null,
    );
    const openingFirst = openFolder("/first");
    await vi.waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("restore_workspace", { path: "/first" }),
    );
    const openingSecond = openFolder("/second");
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "open_workspace_in_new_window",
      expect.anything(),
    );
    first.resolve(bundle("/first"));
    await Promise.all([openingFirst, openingSecond]);
    expect(useWorkspaceStore.getState().root).toBe("/first");
    expect(mockedInvoke).toHaveBeenCalledWith("open_workspace_in_new_window", {
      path: "/second",
      file: null,
    });
  });
});

test("startup hydrates the saved path and opens recovery Settings on a restore error", async () => {
  await applyStartupState({
    settings: { [DEFAULT_FOLDER_KEY]: "/offline/notes" },
    recent_workspaces: ["/different"],
    restore_bundle: null,
    standalone_file: null,
    restore_error: "Could not open /offline/notes",
  });
  expect(useSettingsStore.getState().settings[DEFAULT_FOLDER_KEY]).toBe("/offline/notes");
  expect(useWorkspaceStore.getState().openError).toContain("/offline/notes");
  expect(useWorkspaceStore.getState().root).toBeNull();
  expect(useEditorStore.getState().tabs[0]?.location.kind).toBe("settings");
});
