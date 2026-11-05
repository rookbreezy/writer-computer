import { useState } from "react";
import { useSetting } from "@/hooks/use-settings";
import { useFolderOpenError } from "@/hooks/use-workspace";
import {
  chooseDefaultFolder,
  DEFAULT_FOLDER_KEY,
  reopenDefaultFolder,
} from "@/hooks/use-default-folder";
import { SETTINGS_SCHEMA } from "@/lib/settings-schema";

const definition = SETTINGS_SCHEMA.find((def) => def.key === DEFAULT_FOLDER_KEY)!;

export function FolderSection() {
  const folder = useSetting(DEFAULT_FOLDER_KEY);
  const error = useFolderOpenError();
  const [busy, setBusy] = useState(false);
  const savedFolder = typeof folder === "string" ? folder : "";

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-10" aria-labelledby="folder-heading">
      <h2 id="folder-heading" className="mb-3 text-[13px] font-medium text-[var(--text-muted)]">
        {definition.label}
      </h2>
      <div className="-mx-4 rounded-2xl border border-[var(--line-subtler)] bg-[var(--surface-card)] p-4">
        <p className="text-[13px] text-[var(--text-muted)]">{definition.description}</p>
        <p
          className="mt-3 break-all text-[13px] text-[var(--text-primary)]"
          title={savedFolder || undefined}
        >
          {savedFolder || "No folder selected"}
        </p>
        {error && (
          <p role="alert" className="mt-3 break-words text-[13px] text-[var(--text-primary)]">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2" aria-busy={busy}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(chooseDefaultFolder)}
            className="rounded-lg bg-[var(--surface-input)] px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-subtle-strong)] disabled:opacity-50"
          >
            {busy ? "Opening…" : savedFolder ? "Change Folder…" : "Choose Folder…"}
          </button>
          {error && savedFolder && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(reopenDefaultFolder)}
              className="rounded-lg border border-[var(--line-subtle)] px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
