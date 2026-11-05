export type AppView = "compact-file" | "workspace-editor" | "workspace-welcome";

export function resolveAppView(
  root: string | null,
  chromeMode: "workspace" | "compact-file",
  activePageKind?: string,
): AppView {
  if (chromeMode === "compact-file") return "compact-file";
  return root || activePageKind === "settings" ? "workspace-editor" : "workspace-welcome";
}
