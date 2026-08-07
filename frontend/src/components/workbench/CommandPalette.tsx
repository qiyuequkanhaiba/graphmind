import { Search, X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useDialogEntranceMotion } from "../../motion/useWorkbenchMotion";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

export type WorkbenchCommand = {
  category: string;
  description: string;
  id: string;
  keywords?: string[];
  label: string;
  onRun: () => void;
  shortcut?: string;
};

type Props = {
  commands: WorkbenchCommand[];
  onClose: () => void;
};

export default function CommandPalette({ commands, onClose }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    dialogRef,
    handleDialogKeyDown
  } = useDialogFocusTrap<HTMLElement>(onClose, { initialFocusRef: searchInputRef });
  useDialogEntranceMotion(dialogRef);
  const filteredCommands = useMemo(
    () => filterCommands(commands, query),
    [commands, query]
  );

  useEffect(() => {
    commandRefs.current = commandRefs.current.slice(0, filteredCommands.length);
    setActiveCommandIndex((current) =>
      filteredCommands.length === 0 ? -1 : Math.min(Math.max(current, 0), filteredCommands.length - 1)
    );
  }, [filteredCommands.length]);

  function updateQuery(value: string) {
    setQuery(value);
    setActiveCommandIndex(0);
  }

  function runCommand(command: WorkbenchCommand) {
    onClose();
    command.onRun();
  }

  function focusCommand(index: number) {
    if (filteredCommands.length === 0) {
      return;
    }

    const nextIndex = (index + filteredCommands.length) % filteredCommands.length;
    setActiveCommandIndex(nextIndex);
    commandRefs.current[nextIndex]?.focus();
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && filteredCommands.length > 0) {
      event.preventDefault();
      focusCommand(0);
      return;
    }

    if (event.key === "ArrowUp" && filteredCommands.length > 0) {
      event.preventDefault();
      focusCommand(filteredCommands.length - 1);
      return;
    }

    if (event.key === "Enter" && filteredCommands[0]) {
      event.preventDefault();
      runCommand(filteredCommands[0]);
    }
  }

  function handleCommandKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    command: WorkbenchCommand
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCommand(index + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCommand(index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusCommand(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusCommand(filteredCommands.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      runCommand(command);
    }
  }

  return (
    <div className="command-palette-backdrop" role="presentation">
      <section
        aria-labelledby="command-palette-title"
        aria-modal="true"
        className="command-palette"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id="command-palette-title">{t("command.title")}</h2>
            <p>{t("command.shortcut")}</p>
          </div>
          <span className="command-palette-count">
            {t("command.count", { count: filteredCommands.length })}
          </span>
          <button
            aria-label={t("command.close")}
            className="command-palette-close"
            onClick={onClose}
            title={t("command.close")}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <label className="command-palette-search">
          <Search aria-hidden="true" size={16} />
          <span>{t("command.search")}</span>
          <input
            aria-controls="command-palette-results"
            aria-label={t("command.search")}
            autoFocus
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t("command.placeholder")}
            ref={searchInputRef}
            type="search"
            value={query}
          />
        </label>

        {filteredCommands.length > 0 ? (
          <div
            aria-label={t("command.results")}
            className="command-palette-results"
            id="command-palette-results"
            role="listbox"
          >
            {filteredCommands.map((command, index) => (
              <button
                aria-label={command.label}
                aria-selected={activeCommandIndex === index}
                className="command-palette-option"
                key={command.id}
                onClick={() => runCommand(command)}
                onFocus={() => setActiveCommandIndex(index)}
                onKeyDown={(event) => handleCommandKeyDown(event, index, command)}
                ref={(element) => {
                  commandRefs.current[index] = element;
                }}
                role="option"
                type="button"
              >
                <span className="command-palette-category">{command.category}</span>
                <span className="command-palette-copy">
                  <strong>{command.label}</strong>
                  <small>{command.description}</small>
                </span>
                {command.shortcut ? (
                  <kbd className="command-palette-shortcut">{command.shortcut}</kbd>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="command-palette-empty">{t("command.empty")}</p>
        )}
      </section>
    </div>
  );
}

function filterCommands(commands: WorkbenchCommand[], query: string): WorkbenchCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  return commands.filter((command) => {
    const searchableText = [
      command.label,
      command.category,
      command.description,
      command.shortcut,
      ...(command.keywords ?? [])
    ].join(" ").toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}
