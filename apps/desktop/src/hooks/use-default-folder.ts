import * as tauri from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { openFolder } from "./use-open-drop";

export const DEFAULT_FOLDER_KEY = "workspace.default-folder";

async function withFolderRecovery(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    useWorkspaceStore.getState().reportOpenError(String(error));
  }
}

export function chooseDefaultFolder() {
  return withFolderRecovery(async () => {
    const picked = await tauri.pickWorkspace();
    if (!picked) return;
    // Wait for disk persistence before opening; a write failure must retain
    // the previous choice and its recovery UI.
    await useSettingsStore.getState().setSetting(DEFAULT_FOLDER_KEY, picked, "global");
    await openFolder(picked);
  });
}

export function reopenDefaultFolder() {
  return withFolderRecovery(async () => {
    const path = useSettingsStore.getState().getSetting(DEFAULT_FOLDER_KEY);
    if (typeof path === "string" && path) await openFolder(path);
  });
}
