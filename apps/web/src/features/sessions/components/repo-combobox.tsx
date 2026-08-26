"use client";

import { useEffect, useRef, useState } from "react";

import type { BeeRegisteredRepo } from "@/lib/bee/types";

import { matchesQuery } from "../lib/search-filter";

/** Sentinel value for "No repo — just chat" — never a valid repo slug. */
export const CHAT_OPTION = "__chat__";

const CHAT_LABEL = "No repo — just chat";

/**
 * Self-built combobox: one trigger button, search input INSIDE the dropdown.
 * The repo list is small (repos.d on one machine) — no virtualization, no
 * extra dependency (shadcn Command/cmdk is not installed on purpose).
 *
 * The chat option is pinned last and never filtered out: it is the escape
 * hatch, not a search result.
 */
export function RepoCombobox({
  repos,
  value,
  onChange,
}: {
  repos: BeeRegisteredRepo[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const matched = repos.filter((r) => matchesQuery(r.repo, query));
  // Options the keyboard walks over: filtered repos, then the pinned chat row.
  const options: { value: string; label: string }[] = [
    ...matched.map((r) => ({ value: r.slug, label: r.repo })),
    { value: CHAT_OPTION, label: CHAT_LABEL },
  ];

  const selectedLabel = repos.find((r) => r.slug === value)?.repo ?? CHAT_LABEL;

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function openPanel() {
    setQuery("");
    // Start the highlight on the current selection so Enter is a no-op change.
    const current = repos.findIndex((r) => r.slug === value);
    setActive(current >= 0 ? current : repos.length);
    setOpen(true);
  }

  function pick(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[active];
      if (opt !== undefined) pick(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      className="relative sm:max-w-64"
      // Close when focus leaves the whole widget (click elsewhere, Tab out).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label="Repository"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? "repo-combobox-listbox" : undefined}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-control border border-border bg-transparent px-2 font-mono text-sm text-body"
      >
        <span className="truncate">{selectedLabel}</span>
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-56 rounded-card border border-border bg-card p-1 shadow-md">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search repos…"
            aria-label="Search repos"
            aria-activedescendant={options[active] ? `repo-option-${options[active].value}` : undefined}
            // text-base on phones: anything under 16px makes iOS Safari
            // auto-zoom the page the moment this input gets focus.
            className="mb-1 h-8 w-full rounded-control border border-border bg-transparent px-2 text-base text-body outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <ul id="repo-combobox-listbox" role="listbox" aria-label="Repositories" className="max-h-56 overflow-y-auto">
            {matched.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No matching repo</li>
            )}
            {options.map((opt, i) => (
              <li
                key={opt.value}
                id={`repo-option-${opt.value}`}
                role="option"
                aria-selected={opt.value === value}
                // Keep focus in the search input so blur-to-close does not
                // fire between mousedown and click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt.value)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer truncate rounded-control px-2 py-1.5 font-mono text-sm ${
                  i === active ? "bg-accent text-accent-foreground" : "text-body"
                } ${opt.value === CHAT_OPTION ? "mt-1 border-t border-border pt-2" : ""}`}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
