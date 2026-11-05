// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/theme", () => ({ applyTheme: vi.fn(), applyCssVarBindings: vi.fn() }));
vi.mock("@/components/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/editor-area/editor-tabs", () => ({ EditorTabs: () => null }));
vi.mock("@/components/settings-panel/themes-section", () => ({ ThemesSection: () => null }));
vi.mock("@/components/editor-area", async () => {
  const { createElement: element } = await import("react");
  const { SettingsPanel } = await import("../src/components/settings-panel");
  return { EditorArea: () => element(SettingsPanel, { isActive: true }) };
});

import { invoke } from "@tauri-apps/api/core";
import { AppLayout } from "../src/components/app-layout";
import { applyStartupState } from "../src/hooks/use-open-drop";
import { SETTINGS_SCHEMA } from "../src/lib/settings-schema";
import { useEditorStore } from "../src/stores/editor-store";
import { useWorkspaceStore } from "../src/stores/workspace-store";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(invoke).mockResolvedValue([]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  useWorkspaceStore.setState({ root: null, chromeMode: "workspace", openError: null });
  useEditorStore.setState({
    tabs: [],
    openFiles: new Map(),
    activeTabId: null,
    activeFilePath: null,
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("failed startup visibly renders the saved folder, error, and recovery controls without a workspace", async () => {
  await applyStartupState({
    settings: {
      ...Object.fromEntries(SETTINGS_SCHEMA.map((def) => [def.key, def.default])),
      "workspace.default-folder": "/Offline/My Notes",
    },
    recent_workspaces: [],
    restore_bundle: null,
    standalone_file: null,
    restore_error: "The notes disk is disconnected",
  });
  await act(async () => root.render(createElement(AppLayout)));
  const markup = container.innerHTML;
  expect(markup).toContain("data-settings-panel");
  expect(markup).toContain("/Offline/My Notes");
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("The notes disk is disconnected");
  expect(markup).toContain("Change Folder…");
  expect(markup).toContain("Try Again");
  expect(markup.indexOf('id="folder-heading"')).toBeLessThan(markup.indexOf(">Appearance</h2>"));
  act(() => useEditorStore.getState().closeActiveTab());
  const closed = container.innerHTML;
  expect(closed).not.toContain("data-settings-panel");
  expect(closed).toContain("Add Folder");
});
