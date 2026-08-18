import { ArrowRight, Bot, Command, Database, ListChecks, Moon, Network, Search, Share2, Sun, Upload, X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, GraphResponse, RelationshipSuggestion } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import type { WorkbenchTheme } from "../../state/workbenchTheme";
import { getNodeKindLabel } from "../graph/graphSemantics";
import { createRovingTabKeyDownHandler } from "./useRovingTabNavigation";
import { formatGraphSummary, searchGraphNodes } from "./workbenchStats";

export type WorkbenchModule = "graph" | "data" | "insights";
export type WorkbenchNextStepAction = "import_data" | "inspect_graph" | "review_pending";

export type WorkbenchNextStep = {
  action: WorkbenchNextStepAction;
  actionLabel: string;
  description: string;
  title: string;
};

type Props = {
  activeModule?: WorkbenchModule;
  graph: GraphResponse;
  nextStep?: WorkbenchNextStep | null;
  onModuleChange?: (module: WorkbenchModule) => void;
  onNextStep?: () => void;
  onOpenAISettings?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenDataActions?: () => void;
  onOpenProjectSharing?: () => void;
  onThemeToggle?: () => void;
  commandPaletteButtonRef?: Ref<HTMLButtonElement>;
  suggestions: RelationshipSuggestion[];
  theme?: WorkbenchTheme;
  onSelectNode: (node: GraphNode) => void;
};

const moduleOptions = [
  { icon: Network, labelKey: "workbench.module.graph", value: "graph" },
  { icon: Database, labelKey: "workbench.module.data", value: "data" },
  { icon: Bot, labelKey: "workbench.module.insights", value: "insights" }
] as const;

export default function WorkbenchHeader({
  activeModule = "graph",
  commandPaletteButtonRef,
  graph,
  nextStep = null,
  onModuleChange = () => undefined,
  onNextStep = () => undefined,
  onOpenAISettings = () => undefined,
  onOpenCommandPalette = () => undefined,
  onOpenDataActions = () => undefined,
  onOpenProjectSharing = () => undefined,
  onThemeToggle = () => undefined,
  suggestions,
  theme = "dark",
  onSelectNode
}: Props) {
  const { language, setLanguage, t } = useI18n();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchToggleRef = useRef<HTMLButtonElement | null>(null);
  const results = useMemo(
    () => searchGraphNodes(graph.nodes, query, 8, language),
    [graph.nodes, language, query]
  );
  const showResults = query.trim().length > 0;

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, results.length);
    setActiveResultIndex((current) => (results.length === 0 ? -1 : Math.min(current, results.length - 1)));
  }, [results.length]);

  function selectNode(node: GraphNode) {
    onSelectNode(node);
    closeSearch({ restoreFocus: true });
  }

  function closeSearch({ restoreFocus = false } = {}) {
    setQuery("");
    setActiveResultIndex(-1);
    setSearchOpen(false);
    if (restoreFocus) {
      searchToggleRef.current?.focus();
    }
  }

  function openSearch() {
    setActiveResultIndex(-1);
    setSearchOpen(true);
  }

  function toggleSearch() {
    if (searchOpen) {
      closeSearch({ restoreFocus: true });
      return;
    }
    openSearch();
  }

  function updateQuery(value: string) {
    setQuery(value);
    setActiveResultIndex(-1);
  }

  function focusResult(index: number) {
    if (results.length === 0) {
      return;
    }

    const nextIndex = (index + results.length) % results.length;
    setActiveResultIndex(nextIndex);
    resultRefs.current[nextIndex]?.focus();
  }

  function handleSearchInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch({ restoreFocus: true });
      return;
    }

    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      focusResult(0);
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      focusResult(results.length - 1);
    }
  }

  function handleResultKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    node: GraphNode
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch({ restoreFocus: true });
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusResult(index + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusResult(index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusResult(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusResult(results.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNode(node);
    }
  }

  const handleModuleTabKeyDown = createRovingTabKeyDownHandler({
    activeValue: activeModule,
    onChange: onModuleChange,
    options: moduleOptions
  });
  const nextThemeLabel =
    theme === "dark" ? t("workbench.theme.toLight") : t("workbench.theme.toDark");
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <header className="workbench-header">
      <div className="workbench-brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <h1>GraphMind</h1>
          <p>{t("workbench.subtitle")}</p>
        </div>
      </div>

      <div className="workbench-header-status">{formatGraphSummary(graph, suggestions, language)}</div>

      <nav className="workbench-module-tabs" role="tablist" aria-label={t("workbench.module.navigation")}>
        {moduleOptions.map((module) => {
          const Icon = module.icon;
          const label = t(module.labelKey);
          return (
            <button
              aria-selected={activeModule === module.value}
              className={activeModule === module.value ? "active" : ""}
              key={module.value}
              onClick={() => onModuleChange(module.value)}
              onKeyDown={handleModuleTabKeyDown}
              role="tab"
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="workbench-header-actions">
        {nextStep ? (
          <section className="workbench-next-step" aria-label={t("workbench.nextStep.region")}>
            <button
              aria-describedby="workbench-next-step-tooltip"
              aria-label={nextStep.title}
              className="workbench-header-action workbench-next-step-hint"
              type="button"
            >
              <WorkflowRecommendationIcon action={nextStep.action} />
            </button>
            <span
              className="workbench-next-step-tooltip"
              id="workbench-next-step-tooltip"
              role="tooltip"
            >
              <strong>{nextStep.title}</strong>
              <span>{nextStep.description}</span>
            </span>
            <button
              className="workbench-next-step-action"
              onClick={onNextStep}
              type="button"
            >
              <span>{nextStep.actionLabel}</span>
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          </section>
        ) : null}
        <button
          aria-label={t("command.open")}
          className="workbench-header-action"
          onClick={onOpenCommandPalette}
          ref={commandPaletteButtonRef}
          title={t("command.open")}
          type="button"
        >
          <Command aria-hidden="true" size={16} />
          <span>{t("command.open")}</span>
        </button>
        <button
          aria-label={t("workbench.openDataIntake")}
          className="workbench-header-action"
          onClick={onOpenDataActions}
          title={t("workbench.openDataIntake")}
          type="button"
        >
          <Database aria-hidden="true" size={16} />
          <span>{t("workbench.openDataIntake")}</span>
        </button>
        <button
          aria-label={t("workbench.openAISettings")}
          className="workbench-header-action"
          onClick={onOpenAISettings}
          title={t("workbench.openAISettings")}
          type="button"
        >
          <Bot aria-hidden="true" size={16} />
          <span>{t("workbench.openAISettings")}</span>
        </button>
        <button
          aria-label={t("workbench.openProjectSharing")}
          className="workbench-header-action"
          onClick={onOpenProjectSharing}
          title={t("workbench.openProjectSharing")}
          type="button"
        >
          <Share2 aria-hidden="true" size={16} />
          <span>{t("workbench.openProjectSharing")}</span>
        </button>
        <button
          aria-label={nextThemeLabel}
          className="workbench-header-action workbench-theme-toggle"
          onClick={onThemeToggle}
          title={nextThemeLabel}
          type="button"
        >
          <ThemeIcon aria-hidden="true" size={16} />
          <span>{theme === "dark" ? t("workbench.theme.light") : t("workbench.theme.dark")}</span>
        </button>
        <div className="segmented language-switcher" aria-label={t("language.label")}>
          <button
            className={language === "zh-CN" ? "active" : ""}
            onClick={() => setLanguage("zh-CN")}
            type="button"
          >
            {t("language.zh")}
          </button>
          <button
            className={language === "en-US" ? "active" : ""}
            onClick={() => setLanguage("en-US")}
            type="button"
          >
            {t("language.english")}
          </button>
        </div>
        <button
          aria-expanded={searchOpen}
          className={`workbench-search-toggle${searchOpen ? " active" : ""}`}
          onClick={toggleSearch}
          ref={searchToggleRef}
          title={t("search.label")}
          type="button"
        >
          <Search aria-hidden="true" size={16} />
          <span>{t("search.label")}</span>
        </button>
      </div>

      {searchOpen ? (
        <div className="workbench-search" role="search">
          <div className="workbench-search-row">
            <label>
              <span>{t("search.label")}</span>
              <input
                aria-label={t("search.label")}
                aria-controls={showResults ? "workbench-search-results" : undefined}
                autoFocus
                onChange={(event) => updateQuery(event.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={t("search.placeholder")}
                ref={searchInputRef}
                type="search"
                value={query}
              />
            </label>
            <button
              aria-label={t("search.close")}
              className="workbench-search-close"
              onClick={() => closeSearch({ restoreFocus: true })}
              title={t("search.close")}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
          {showResults ? (
            <div
              aria-label={t("search.label")}
              className="workbench-search-results"
              id="workbench-search-results"
              role="listbox"
            >
              {results.length > 0 ? (
                results.map((node, index) => (
                  <button
                    aria-label={t("search.select", { label: node.label })}
                    aria-selected={activeResultIndex === index}
                    id={`workbench-search-result-${node.id}`}
                    key={node.id}
                    onFocus={() => setActiveResultIndex(index)}
                    onKeyDown={(event) => handleResultKeyDown(event, index, node)}
                    onClick={() => selectNode(node)}
                    ref={(element) => {
                      resultRefs.current[index] = element;
                    }}
                    role="option"
                    type="button"
                  >
                    <span>{getNodeKindLabel(node.node_type, language)}</span>
                    <strong>{node.label}</strong>
                    <small>{node.source_ref}</small>
                  </button>
                ))
              ) : (
                <p>{t("search.empty")}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function WorkflowRecommendationIcon({ action }: { action: WorkbenchNextStepAction }) {
  if (action === "review_pending") {
    return <ListChecks aria-hidden="true" size={16} />;
  }
  if (action === "inspect_graph") {
    return <Network aria-hidden="true" size={16} />;
  }
  return <Upload aria-hidden="true" size={16} />;
}
