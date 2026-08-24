"use client";

import {
  CircleStopIcon,
  FoldVerticalIcon,
  PlusIcon,
  SquareSlashIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import type { BeeSessionMode, BeeSessionModel } from "@/lib/bee/types";

import { MODE_OPTIONS } from "./new-session-form";

/**
 * The model picker's rows, VSCode's "Select a model" order. Values are the
 * aliases `claude --model` takes (CAC_MODEL_PHIEN); "default" sends no flag
 * at all, so whatever the machine is set to answers.
 */
export const MODEL_OPTIONS: { value: BeeSessionModel; label: string; moTa: string }[] = [
  { value: "default", label: "Default", moTa: "The machine's own default — recommended" },
  { value: "opus[1m]", label: "Opus (1M context)", moTa: "Opus with the 1M-token window" },
  { value: "opus", label: "Opus", moTa: "Best for everyday, complex tasks" },
  { value: "sonnet", label: "Sonnet", moTa: "Efficient for routine tasks" },
  { value: "sonnet[1m]", label: "Sonnet (1M context)", moTa: "Sonnet with the 1M-token window" },
  { value: "haiku", label: "Haiku", moTa: "Fastest for quick answers" },
];

/**
 * The two bottom-left buttons of the chat box, VSCode-style (23/08):
 *
 * - PlusMenu   — "+" opens the attach menu; today its one real item is
 *   "Upload from computer" (a phone camera-roll screenshot reaching the
 *   agent's worktree is the flagship use).
 * - ActionsPanel — the boxed "/" opens a "Filter actions…" palette:
 *   commands, session actions (compact/stop) and the mode switch in one
 *   searchable list, so none of it needs a keyboard on a phone.
 *
 * Both are pure UI: every effect goes out through callbacks; LiveView owns
 * the transitions and server actions.
 */

export function PlusMenu({
  disabled = false,
  onUpload,
}: {
  disabled?: boolean;
  onUpload: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Attach"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-body disabled:opacity-40"
      >
        <PlusIcon className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Attach"
          className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-card border border-border bg-popover p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
            className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm text-body hover:bg-accent"
          >
            <UploadIcon className="size-4 shrink-0 text-muted-foreground" />
            Upload from computer
          </button>
        </div>
      )}
      {/* Kept outside the menu so the picker survives the menu closing. */}
      <input
        ref={fileRef}
        type="file"
        aria-label="File to upload"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return <p className="px-2.5 pt-2 pb-1 text-xs text-muted-foreground">{children}</p>;
}

export function ActionsPanel({
  commands,
  mode,
  model,
  onInsertCommand,
  onCompact,
  onStop,
  onPickMode,
  onPickModel,
}: {
  commands: { name: string; moTa: string }[];
  /** `null` = a chat session: no tools, so no permission mode to switch. */
  mode: BeeSessionMode | null;
  model: BeeSessionModel;
  onInsertCommand: (name: string) => void;
  onCompact: () => void;
  onStop: () => void;
  onPickMode: (m: BeeSessionMode) => void;
  onPickModel: (m: BeeSessionModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const hit = (text: string) => text.toLowerCase().includes(filter.trim().toLowerCase());
  const cmds = commands.filter((c) => hit(`/${c.name} ${c.moTa}`));
  const sessionActions = [
    {
      label: "Compact conversation",
      hint: "frees context, keeps the gist",
      Icon: FoldVerticalIcon,
      run: onCompact,
    },
    { label: "Stop session", hint: "the agent stops now", Icon: CircleStopIcon, run: onStop },
  ].filter((a) => hit(`${a.label} ${a.hint}`));
  const modes = mode === null ? [] : MODE_OPTIONS.filter((m) => hit(`${m.label} ${m.moTa}`));
  const models = MODEL_OPTIONS.filter((m) => hit(`model ${m.label} ${m.moTa}`));

  function close() {
    setOpen(false);
    setFilter("");
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <button
        type="button"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-body"
      >
        <SquareSlashIcon className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Session actions menu"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-72 overflow-y-auto rounded-card border border-border bg-popover p-1 shadow-md"
        >
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter actions…"
            aria-label="Filter actions"
            autoFocus
            className="mb-1 w-full rounded-control border border-border bg-input/30 px-2.5 py-1.5 text-sm text-body outline-none placeholder:text-muted-foreground"
          />
          {cmds.length > 0 && (
            <>
              <GroupLabel>Commands</GroupLabel>
              {cmds.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onInsertCommand(c.name);
                  }}
                  className="flex w-full items-baseline gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <span className="font-mono text-sm text-body">/{c.name}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{c.moTa}</span>
                </button>
              ))}
            </>
          )}
          {sessionActions.length > 0 && (
            <>
              <GroupLabel>Session</GroupLabel>
              {sessionActions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    a.run();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <a.Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-body">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.hint}</span>
                  </span>
                </button>
              ))}
            </>
          )}
          {modes.length > 0 && (
            <>
              <GroupLabel>Mode</GroupLabel>
              {modes.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m.value === mode}
                  onClick={() => {
                    close();
                    onPickMode(m.value);
                  }}
                  className="flex w-full items-baseline gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <span className="text-sm text-body">{m.label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {m.moTa}
                  </span>
                  {m.value === mode && <span className="text-sm text-body">✓</span>}
                </button>
              ))}
            </>
          )}
          {models.length > 0 && (
            <>
              <GroupLabel>Model</GroupLabel>
              {models.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="menuitemradio"
                  // Explicit label: "Sonnet" and "Sonnet (1M context)" are
                  // prefixes of each other, so text alone is ambiguous.
                  aria-label={`Model: ${m.label}`}
                  aria-checked={m.value === model}
                  onClick={() => {
                    close();
                    onPickModel(m.value);
                  }}
                  className="flex w-full items-baseline gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <span className="text-sm text-body">{m.label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {m.moTa}
                  </span>
                  {m.value === model && <span className="text-sm text-body">✓</span>}
                </button>
              ))}
            </>
          )}
          {cmds.length === 0 &&
            sessionActions.length === 0 &&
            modes.length === 0 &&
            models.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">Nothing matches.</p>
            )}
        </div>
      )}
    </div>
  );
}
