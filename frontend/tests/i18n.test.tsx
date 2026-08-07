import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";

function Probe() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div>
      <span>{language}</span>
      <strong>{t("workbench.subtitle")}</strong>
      <button onClick={() => setLanguage("en-US")} type="button">
        English
      </button>
      <button onClick={() => setLanguage("zh-CN")} type="button">
        中文
      </button>
    </div>
  );
}

describe("i18n", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value)
      }
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to Simplified Chinese", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );

    expect(screen.getByText("zh-CN")).toBeInTheDocument();
    expect(screen.getByText("本地表格关系分析工作台")).toBeInTheDocument();
  });

  it("restores language preference", () => {
    window.localStorage.setItem("graphmind.language", "en-US");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );

    expect(screen.getByText("en-US")).toBeInTheDocument();
    expect(screen.getByText("Local spreadsheet relationship workbench")).toBeInTheDocument();
  });

  it("persists language changes", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(window.localStorage.getItem("graphmind.language")).toBe("en-US");
  });
});
